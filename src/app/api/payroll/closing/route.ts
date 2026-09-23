import { NextRequest } from "next/server";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { closePeriod, PeriodClosingResult } from "@/lib/payroll";

// BR-034 + 2026-09-24 (per the user): closing is the final step of a
// payroll cycle, irreversible, and now does two things beyond just marking
// the period CLOSED+locked: (1) commits the live "ยอดจากการคำนวน" preview
// (same number the Payslip shows) into real inv_employee_debt balances —
// see closePeriod() in src/lib/payroll.ts for exactly how; (2) advances
// IsCurrent to whichever period covers the day right after this one ends
// for the same EmployeeType, reusing one if it already exists or
// auto-creating one with the same cadence if not.
//
// The BR text also says "ล้างรายการ Transaction ของงวดที่ปิดแล้ว" (clear the
// period's transactions) — deliberately NOT implemented as a physical
// DELETE: trn_payroll_transaction is real financial history with no
// separate archive table in the approved schema, so destroying it on an
// irreversible action would violate the project's own data-integrity rule.
// "Cleared" is interpreted as "no longer open for change" (CLOSED + locked),
// not deleted — a deliberate, documented interpretation, flagged in
// CLAUDE.md rather than a literal reading.
export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_CLOSING", "approve");
  if (denied) return denied;

  let body: { periodId?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const periodId = Number(body.periodId);
  if (!Number.isInteger(periodId)) return apiError(400, "INVALID_PARAMS", "periodId is required and must be an integer");

  let result: PeriodClosingResult;
  try {
    result = await closePeriod(periodId, user.userId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message === "PERIOD_NOT_FOUND") return apiError(404, "PERIOD_NOT_FOUND");
    if (message === "PERIOD_ALREADY_CLOSED") return apiError(409, "PERIOD_ALREADY_CLOSED");
    if (message === "PERIOD_NOT_LOCKED") return apiError(409, "PERIOD_NOT_LOCKED", "Lock the period before closing it");
    if (message === "PERIOD_NOT_APPROVED") return apiError(409, "PERIOD_NOT_APPROVED", "Approve the period before closing it");
    throw e;
  }

  await logAction(user.userId, "PAYROLL_CLOSING", {
    targetTable: "sys_period",
    targetId: String(periodId),
    detail: `ตัดยอดหนี้คงค้าง ${result.debtsSettled} รายการ, ${result.nextPeriodCreated ? "สร้างงวดถัดไปใหม่" : "เลื่อนงวดปัจจุบันไปงวดที่มีอยู่แล้ว"} (PeriodID ${result.nextPeriodId})`,
  });
  return apiSuccess({ ok: true, ...result });
}
