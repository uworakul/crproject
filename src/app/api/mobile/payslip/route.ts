import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireSelfEmployee } from "@/lib/mobile-auth";
import { listViewablePayslipPeriods } from "@/lib/mobile-leave";
import { getPayslipRows } from "@/lib/reports/payroll-reports";

// Only periods that have been sent for approval (trn_payroll_lock.IsLocked)
// are visible to the employee — before that the numbers can still change.
// Only the employee's OWN payslip is ever returned: empCode is forced to the
// logged-in user's, never taken from the request.
//
// GET            -> list of viewable periods (newest first)
// GET ?periodId= -> that period's payslip
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const me = await requireSelfEmployee(user);
  if ("error" in me) return me.error;
  const empCode = me.employee.EmpCode;

  const periodIdParam = new URL(request.url).searchParams.get("periodId");

  if (!periodIdParam) {
    return apiSuccess(await listViewablePayslipPeriods(empCode));
  }

  const periodId = Number(periodIdParam);
  if (!Number.isInteger(periodId)) return apiError(400, "INVALID_PARAMS", "periodId is invalid");

  const lock = await prisma.trnPayrollLock.findFirst({ where: { PeriodID: periodId, IsLocked: true } });
  const mine = lock ? await prisma.trnPayrollTransaction.findFirst({ where: { PeriodID: periodId, EmpCode: empCode }, select: { TransactionID: true } }) : null;
  // Same response whether the period is unknown, not locked yet, or simply
  // has no row for this employee — nothing to leak about other people/periods.
  if (!lock || !mine) return apiError(404, "PAYSLIP_NOT_AVAILABLE", "ยังไม่มีสลิปเงินเดือนของงวดนี้");

  const rows = await getPayslipRows(periodId, { empCode });
  const slip = rows.find((r) => r.empCode === empCode);
  if (!slip) return apiError(404, "PAYSLIP_NOT_AVAILABLE", "ยังไม่มีสลิปเงินเดือนของงวดนี้");
  return apiSuccess(slip);
}
