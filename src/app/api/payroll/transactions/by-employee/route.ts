import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getRateConfigForEmployee, recomputeTransactionOtherTotals } from "@/lib/payroll";

// 2026-09-22 — each detail line's SiteCode/PositionCode (set only for lines
// pulled from Worksheet, per-site) needs a display name; manual lines have
// both null and the client shows "-" for those.
const DETAIL_SITE_POSITION_INCLUDE = { Site: { select: { SiteName: true } }, Position: { select: { PositionName: true } } };

// Find-or-create the trn_payroll_transaction row for an employee's current
// period (2026-09-21, "รายการประจำงวด") — same idempotent-GET convention as
// Worksheet's getOrCreateDraftWorksheet(). "Current period" = sys_period
// where EmployeeType matches and IsCurrent=true (the existing toggle on
// /periods, not a new concept). A freshly-created row needs a SiteCode
// (NOT NULL) — uses the employee's DefaultSiteCode; if that's unset, the
// employee must be assigned a site first (422, not guessed).
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_TRANSACTION", "read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const empCode = searchParams.get("empCode");
  if (!empCode) return apiError(400, "INVALID_PARAMS", "empCode is required");

  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND", undefined, { empCode });

  const period = await prisma.sysPeriod.findFirst({ where: { EmployeeType: employee.EmployeeType, IsCurrent: true } });
  if (!period) return apiError(404, "NO_CURRENT_PERIOD", `No period is marked as current for EmployeeType ${employee.EmployeeType}`, { employeeType: employee.EmployeeType });

  let transaction = await prisma.trnPayrollTransaction.findUnique({
    where: { EmpCode_PeriodID: { EmpCode: empCode, PeriodID: period.PeriodID } },
    include: { Details: { orderBy: [{ LineType: "asc" }, { Code: "asc" }], include: DETAIL_SITE_POSITION_INCLUDE } },
  });

  // Rate config from this employee's Site+Position อัตรากำลังพล
  // (mst_site_position_income) — fetched every call (not just on first
  // creation) so the client can auto-calculate "จำนวนเงิน" from days/hours
  // entered on ANY line whose Code matches, whether that line was
  // auto-loaded or added manually later (2026-09-21, confirmed with user).
  // 2026-09-21: if the Site+Position pair hasn't configured a rate for a
  // given IncomeCode, fall back to the Position's own "รายได้พื้นฐาน"
  // (mst_position_income) for that code — confirmed with user this applies
  // generically to whatever codes are configured there, not just ค่าแรง/OT/
  // ค่าตำแหน่ง. Position-level rows go in first, then Site-specific rows
  // overwrite them where both exist, so the more specific rate always wins.
  const rateConfigMap = await getRateConfigForEmployee(employee);
  const rateConfig: Record<string, { amount: string; rateBasis: string }> = {};
  for (const [code, cfg] of rateConfigMap) rateConfig[code] = { amount: cfg.amount.toString(), rateBasis: cfg.rateBasis };

  // Union of Site+Position codes and Position-only codes, for seeding new
  // transactions below — Site-specific IncomeType name wins if both exist
  // (same source table either way, just picking a description to snapshot).
  const seedRowsByCode = new Map<string, { IncomeName: string }>();
  for (const [code, cfg] of rateConfigMap) seedRowsByCode.set(code, { IncomeName: cfg.incomeName });

  if (!transaction) {
    // 2026-09-22: only the CREATE path needs this — reading an already-
    // existing transaction (the far more common call, e.g. re-opening the
    // detail panel) must keep working even on a locked period; only adding
    // a brand-new employee to a locked, already-submitted-for-approval
    // period should be blocked (same "ห้ามแก้ไข ลบ หรือ ดึง worksheet ถ้าจะ
    // ทำต้องปลดล็อกก่อน" the user asked for on this whole screen).
    const lock = await prisma.trnPayrollLock.findFirst({ where: { PeriodID: period.PeriodID, IsLocked: true } });
    if (lock) return apiError(409, "PERIOD_LOCKED", "This period is locked and cannot be edited");

    if (!employee.DefaultSiteCode) {
      return apiError(422, "EMPLOYEE_HAS_NO_SITE", "This employee has no DefaultSiteCode set — assign a site before creating a payroll transaction for them", { empCode });
    }

    // 2026-09-21: on first creation only (never re-applied on later visits,
    // so deleting an auto-loaded line sticks), seed detail lines from this
    // employee's Site+Position อัตรากำลังพล config (mst_site_position_income),
    // union'd with any Position-level "รายได้พื้นฐาน" (mst_position_income)
    // codes the site hasn't configured — only Code+Description (the income
    // TYPE) is brought over; Amount starts at 0 always (explicitly not the
    // configured rate — confirmed 2026-09-21: "เอารายได้ มาแต่รหัสกับชื่อ
    // ยอดเงินต่างๆ ไม่ต้องเอามา") — the user fills in days/hours themselves
    // and the client auto-computes the amount from rateConfig above (a
    // later, separate confirmation). Silently seeds nothing if the employee
    // has no PositionCode or neither table has any rate config for them —
    // this is a convenience starting point, not a requirement; "+ เพิ่มรายการ"
    // still works afterward for anything else, same as any manually-added
    // line.
    transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.trnPayrollTransaction.create({
        data: { EmpCode: empCode, PeriodID: period.PeriodID, SiteCode: employee.DefaultSiteCode!, CreatedBy: user.userId },
      });

      if (seedRowsByCode.size > 0) {
        await tx.trnPayrollTransactionDetail.createMany({
          data: [...seedRowsByCode.entries()].map(([code, incomeType]) => ({
            TransactionID: created.TransactionID,
            LineType: "INCOME" as const,
            Code: code,
            Description: incomeType.IncomeName,
            Amount: 0,
            CreatedBy: user.userId,
          })),
        });
        await recomputeTransactionOtherTotals(tx, created.TransactionID, user.userId);
      }

      return tx.trnPayrollTransaction.findUniqueOrThrow({
        where: { TransactionID: created.TransactionID },
        include: { Details: { orderBy: [{ LineType: "asc" }, { Code: "asc" }], include: DETAIL_SITE_POSITION_INCLUDE } },
      });
    });
  }

  return apiSuccess({ period, transaction, rateConfig });
}
