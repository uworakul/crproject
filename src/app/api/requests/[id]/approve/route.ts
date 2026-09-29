import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import {
  REQUEST_DOCUMENT_DOCTYPE,
  REQUEST_DOCUMENT_KIND,
  REQUEST_INCOME_CODE,
  REQUEST_DOCUMENT_DEDUCTION_CODE,
  REQUEST_DOCUMENT_CODE_LABELS,
  COMMISSION_MIN_DAYS,
  type RequestDocumentCode,
} from "@/lib/request";
import { findOrCreateCurrentPeriodTransaction, recomputeTransactionOtherTotals } from "@/lib/payroll";
import { isEmployeeInScope } from "@/lib/employee-scope";

// Carries a specific error code (+ context, e.g. which empCode failed) out
// of the $transaction callback below so the route can map it to a proper
// apiError — a plain Error(code) (the convention elsewhere in this app,
// e.g. payroll.ts's PERIOD_NOT_FOUND/PERIOD_LOCKED) doesn't have anywhere
// to carry per-employee context, and several of these branches need it.
class RequestApprovalError extends Error {
  constructor(public readonly code: string, public readonly status: number, message?: string, public readonly context?: Record<string, unknown>) {
    super(message ?? code);
  }
}

function calendarDaysSince(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

// Approve = mark APPROVED, then act on every detail line per the header's
// DocumentCode kind (see REQUEST_DOCUMENT_KIND), all in one DB transaction —
// any single line failing rolls back the whole approval, same "no partial
// approve" discipline as approveWorksheet()/runPayrollCalculate() elsewhere.
//
//   - DEBT (ADVANCE/ADVANCEN/ADVANCEU/LOAN/TRAINING): unchanged since
//     2026-09-19 — creates one inv_employee_debt row per line. Quota
//     checking/mst_employee_quota update removed at the user's explicit
//     request ("ไม่มีโควต้าเดิมแล้ว ออกแบบใหม่ ให้ดูตามรายการหัก") — tracking
//     now flows through "รายการหัก" (ref_deduction_type) / "รายการหักต่องวด"
//     (inv_employee_debt) instead.
//   - INCOME (BONUS/COMMISSION, 2026-09-28): posts an income line to the
//     beneficiary's current-period payroll transaction instead of creating a
//     debt. BONUS's beneficiary is the row's own EmpCode; COMMISSION's is
//     that employee's ReferrerEmpCode (the row names the REFERRED new hire,
//     not who gets paid) — checked eligible first: must have a referrer,
//     must not have claimed before (CommissionClaimedDate), and StartDate
//     must be >=120 calendar days ago (confirmed with user). (COMMISSION was
//     named REFERRAL until later the same day — renamed at the user's
//     request.)
//   - POSITION_CHANGE kind (PROMOTE document code, 2026-09-28): updates
//     mst_employee.PositionCode to each line's NewPositionCode.
//   - RESIGN (2026-09-28): sets EmployeeStatus=RESIGNED + ResignDate to each
//     line's RequestedResignDate, and adds a ref_black_list row if the
//     line's AddToBlacklist is checked.
export async function POST(_req: Request, ctx: RouteContext<"/api/requests/[id]/approve">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.trnRequestHeader.findUnique({
    where: { RequestHeaderID: requestId },
    include: { Details: { include: { Employee: true } } },
  });
  if (!existing) return apiError(404, "REQUEST_NOT_FOUND");
  if (!existing.Details.every((d) => isEmployeeInScope(user, d.Employee))) return apiError(404, "REQUEST_NOT_FOUND");

  const documentCode = existing.DocumentCode as RequestDocumentCode;
  const denied = await requirePermission(user, REQUEST_DOCUMENT_DOCTYPE[documentCode], "approve");
  if (denied) return denied;

  if (existing.Status !== "SUBMITTED") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a SUBMITTED request can be approved", { currentStatus: existing.Status });
  }
  if (existing.Details.length === 0) {
    return apiError(422, "NO_DETAIL_ROWS", "This request has no employee lines to approve");
  }

  const kind = REQUEST_DOCUMENT_KIND[documentCode];
  const description = existing.Remark ?? `${existing.DocumentCode}${existing.DocumentNo ? ` ${existing.DocumentNo}` : ""}`;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (kind === "DEBT") {
        // Maps to the company's existing numeric ref_deduction_type code for
        // this category (see REQUEST_DOCUMENT_DEDUCTION_CODE) rather than
        // using the request's own DocumentCode as the DeductionCode —
        // writing DocumentCode directly used to auto-provision a same-
        // meaning duplicate row next to the numeric one every time (fixed
        // 2026-09-29). Still upserts (create-if-missing) purely as a
        // defensive fallback in case that numeric row was ever deleted; on
        // a normal tenant it's already seeded and this is a no-op.
        const deductionCode = REQUEST_DOCUMENT_DEDUCTION_CODE[documentCode]!;
        const deductionType = await tx.refDeductionType.upsert({
          where: { DeductionCode: deductionCode },
          update: {},
          create: { DeductionCode: deductionCode, DeductionName: REQUEST_DOCUMENT_CODE_LABELS[documentCode], IsInstallment: true, CreatedBy: user.userId },
        });
        for (const d of existing.Details) {
          await tx.invEmployeeDebt.create({
            data: {
              EmpCode: d.EmpCode,
              DeductionCode: deductionType.DeductionCode,
              RequestHeaderID: requestId,
              Description: description,
              TotalAmount: d.Amount,
              RemainingAmount: d.Amount,
              DeductPerPeriod: d.DeductPerPeriod,
              Status: "OPEN",
              CreatedBy: user.userId,
            },
          });
        }
      } else if (kind === "INCOME") {
        const incomeCode = REQUEST_INCOME_CODE[documentCode]!;
        // Defensive auto-provision — prisma/seed.ts already seeds these
        // codes ("18"=โบนัส, "19"=ค่านำพา) in every tenant, but don't assume
        // seeding has run.
        const incomeType = await tx.refIncomeType.upsert({
          where: { IncomeCode: incomeCode },
          update: {},
          create: { IncomeCode: incomeCode, IncomeName: documentCode === "BONUS" ? "โบนัส" : "ค่านำพา" },
        });

        for (const d of existing.Details) {
          let beneficiary = d.Employee;

          if (documentCode === "COMMISSION") {
            const referred = d.Employee;
            if (!referred.ReferrerEmpCode) {
              throw new RequestApprovalError("NO_REFERRER", 422, "Referred employee has no ReferrerEmpCode set", { empCode: referred.EmpCode });
            }
            if (referred.CommissionClaimedDate) {
              throw new RequestApprovalError("COMMISSION_ALREADY_CLAIMED", 422, "Commission for this employee has already been claimed", {
                empCode: referred.EmpCode,
                claimedDate: referred.CommissionClaimedDate,
              });
            }
            const daysSinceStart = calendarDaysSince(referred.StartDate, new Date());
            if (daysSinceStart < COMMISSION_MIN_DAYS) {
              throw new RequestApprovalError("COMMISSION_NOT_ELIGIBLE_YET", 422, `Employee has only worked ${daysSinceStart} of the required ${COMMISSION_MIN_DAYS} days`, {
                empCode: referred.EmpCode,
                daysSinceStart,
                daysRequired: COMMISSION_MIN_DAYS,
              });
            }
            const referrer = await tx.mstEmployee.findUnique({ where: { EmpCode: referred.ReferrerEmpCode } });
            if (!referrer) throw new RequestApprovalError("REFERRER_NOT_FOUND", 404, undefined, { referrerEmpCode: referred.ReferrerEmpCode });
            beneficiary = referrer;
          }

          let transaction;
          try {
            ({ transaction } = await findOrCreateCurrentPeriodTransaction(tx, beneficiary, user.userId));
          } catch (err) {
            const code = err instanceof Error ? err.message : "UNKNOWN";
            const status = code === "PERIOD_LOCKED" ? 409 : code === "EMPLOYEE_HAS_NO_SITE" ? 422 : 404;
            throw new RequestApprovalError(code, status, undefined, { empCode: beneficiary.EmpCode });
          }

          // Always a fresh row, never an upsert-by-Code — SiteCode is null
          // for these (not tied to any Worksheet site), and each approved
          // BONUS/COMMISSION document is a genuinely new, additive payment.
          // SQL Server's unique index on (TransactionID,LineType,Code,
          // SiteCode) treats every NULL SiteCode as distinct, so this never
          // collides with an earlier approval's line for the same employee
          // (same reasoning documented on trn_payroll_transaction_detail).
          await tx.trnPayrollTransactionDetail.create({
            data: {
              TransactionID: transaction.TransactionID,
              LineType: "INCOME",
              Code: incomeType.IncomeCode,
              Description: incomeType.IncomeName,
              Amount: d.Amount,
              CreatedBy: user.userId,
            },
          });
          await recomputeTransactionOtherTotals(tx, transaction.TransactionID, user.userId);

          if (documentCode === "COMMISSION") {
            await tx.mstEmployee.update({ where: { EmpCode: d.EmpCode }, data: { CommissionClaimedDate: new Date(), UpdatedBy: user.userId, UpdatedDate: new Date() } });
          }
        }
      } else if (kind === "POSITION_CHANGE") {
        for (const d of existing.Details) {
          if (d.Employee.EmployeeStatus !== "ACTIVE") {
            throw new RequestApprovalError("EMPLOYEE_NOT_ELIGIBLE", 409, "This employee's status no longer allows a position change", {
              empCode: d.EmpCode,
              employeeStatus: d.Employee.EmployeeStatus,
            });
          }
          if (!d.NewPositionCode) throw new RequestApprovalError("VALIDATION_FAILED", 422, "Missing NewPositionCode on a detail row", { empCode: d.EmpCode });
          await tx.mstEmployee.update({ where: { EmpCode: d.EmpCode }, data: { PositionCode: d.NewPositionCode, UpdatedBy: user.userId, UpdatedDate: new Date() } });
        }
      } else {
        // RESIGN
        for (const d of existing.Details) {
          if (d.Employee.EmployeeStatus === "RESIGNED" || d.Employee.EmployeeStatus === "TERMINATED") {
            throw new RequestApprovalError("EMPLOYEE_ALREADY_RESIGNED", 409, "This employee is already resigned/terminated", { empCode: d.EmpCode, employeeStatus: d.Employee.EmployeeStatus });
          }
          if (!d.RequestedResignDate) throw new RequestApprovalError("VALIDATION_FAILED", 422, "Missing RequestedResignDate on a detail row", { empCode: d.EmpCode });
          // BlacklistCode (2026-09-28, replaces an earlier boolean
          // "AddToBlacklist" that auto-created a new ref_black_list row) —
          // picks an EXISTING blacklist reason/category, copied straight
          // onto mst_employee.BlacklistCode, same field the Employee Master
          // screen's own dropdown writes to. Left null/unselected on the
          // request line means "don't touch it" — omitted from the update
          // entirely rather than writing null, so it never clobbers a
          // blacklist code the employee might already have from an
          // unrelated reason.
          await tx.mstEmployee.update({
            where: { EmpCode: d.EmpCode },
            data: {
              EmployeeStatus: "RESIGNED",
              ResignDate: d.RequestedResignDate,
              ...(d.BlacklistCode ? { BlacklistCode: d.BlacklistCode } : {}),
              UpdatedBy: user.userId,
              UpdatedDate: new Date(),
            },
          });
        }
      }

      return tx.trnRequestHeader.update({
        where: { RequestHeaderID: requestId },
        data: { Status: "APPROVED", ApprovedBy: user.userId, ApprovedDate: new Date(), UpdatedBy: user.userId, UpdatedDate: new Date() },
      });
    });

    await logAction(user.userId, "APPROVE_REQUEST", { targetTable: "trn_request_header", targetId: id });
    return apiSuccess(updated);
  } catch (err) {
    if (err instanceof RequestApprovalError) return apiError(err.status, err.code, err.message, err.context);
    throw err;
  }
}
