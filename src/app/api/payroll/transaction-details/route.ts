import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { recomputeTransactionOtherTotals } from "@/lib/payroll";

export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_TRANSACTION", "read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const transactionId = Number(searchParams.get("transactionId"));
  if (!Number.isInteger(transactionId)) return apiError(400, "INVALID_PARAMS", "transactionId is required");

  const rows = await prisma.trnPayrollTransactionDetail.findMany({ where: { TransactionID: transactionId }, orderBy: [{ LineType: "asc" }, { Code: "asc" }] });
  return apiSuccess(rows);
}

// Description is snapshotted from ref_income_type/ref_deduction_type at
// insert time (see schema comment) — looked up here once, never re-read.
export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_TRANSACTION", "save");
  if (denied) return denied;

  let body: { transactionId?: unknown; lineType?: unknown; code?: unknown; hours?: unknown; days?: unknown; amount?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const transactionId = Number(body.transactionId);
  const lineType = body.lineType;
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const amount = Number(body.amount);
  const hours = body.hours !== undefined && body.hours !== "" ? Number(body.hours) : null;
  const days = body.days !== undefined && body.days !== "" ? Number(body.days) : null;

  if (!Number.isInteger(transactionId) || !code) return apiError(400, "INVALID_PARAMS", "transactionId and code are required");
  if (lineType !== "INCOME" && lineType !== "DEDUCTION") return apiError(400, "VALIDATION_FAILED", "lineType must be INCOME or DEDUCTION");
  if (!Number.isFinite(amount) || amount < 0) return apiError(400, "VALIDATION_FAILED", "amount must be a non-negative number");
  if (hours !== null && (!Number.isFinite(hours) || hours < 0)) return apiError(400, "VALIDATION_FAILED", "hours must be a non-negative number");
  if (days !== null && (!Number.isFinite(days) || days < 0)) return apiError(400, "VALIDATION_FAILED", "days must be a non-negative number");

  const transaction = await prisma.trnPayrollTransaction.findUnique({ where: { TransactionID: transactionId } });
  if (!transaction) return apiError(404, "TRANSACTION_NOT_FOUND");

  const lock = await prisma.trnPayrollLock.findFirst({ where: { PeriodID: transaction.PeriodID, IsLocked: true } });
  if (lock) return apiError(409, "PERIOD_LOCKED", "This period is locked and cannot be edited");

  const type = lineType === "INCOME" ? await prisma.refIncomeType.findUnique({ where: { IncomeCode: code } }) : await prisma.refDeductionType.findUnique({ where: { DeductionCode: code } });
  if (!type) return apiError(404, lineType === "INCOME" ? "INCOME_TYPE_NOT_FOUND" : "DEDUCTION_TYPE_NOT_FOUND", undefined, { code });
  const description = lineType === "INCOME" ? (type as { IncomeName: string }).IncomeName : (type as { DeductionName: string }).DeductionName;

  // SiteCode: null explicitly — this is the manual "+ เพิ่มรายการ" entry
  // point, never tied to a Worksheet site (see schema comment on
  // trn_payroll_transaction_detail). findFirst rather than findUnique
  // because the compound unique key's SiteCode is nullable and
  // pullPayrollFromWorksheet() may already own rows with the same
  // (TransactionID, LineType, Code) but a real SiteCode — those aren't
  // duplicates of a manual entry, only another SiteCode:null row would be.
  const existing = await prisma.trnPayrollTransactionDetail.findFirst({
    where: { TransactionID: transactionId, LineType: lineType, Code: code, SiteCode: null },
  });
  if (existing) return apiError(409, "TRANSACTION_DETAIL_ALREADY_EXISTS", undefined, { transactionId, lineType, code });

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.trnPayrollTransactionDetail.create({
      data: { TransactionID: transactionId, LineType: lineType, Code: code, Description: description, SiteCode: null, Hours: hours, Days: days, Amount: amount, CreatedBy: user.userId },
    });
    await recomputeTransactionOtherTotals(tx, transactionId, user.userId);
    return row;
  });

  await logAction(user.userId, "CREATE_PAYROLL_TRANSACTION_DETAIL", { targetTable: "trn_payroll_transaction_detail", targetId: String(created.DetailID) });
  return apiSuccess(created, 201);
}
