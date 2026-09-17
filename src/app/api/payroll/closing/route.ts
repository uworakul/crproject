import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// BR-034: "การปิดงวดเป็นขั้นตอนสุดท้ายของรอบเงินเดือน ... ไม่สามารถ
// ย้อนกลับได้หลังปิดงวด" (final step, irreversible). The BR text also says
// "ล้างรายการ Transaction ของงวดที่ปิดแล้ว" (clear the period's
// transactions) — deliberately NOT implemented as a physical DELETE here:
// trn_payroll_transaction is real financial history with no separate
// archive table in the approved schema, so destroying it on an irreversible
// action would violate the project's own data-integrity rule. Closing
// instead marks the period CLOSED (sys_period.Status) and force-locks it
// (trn_payroll_lock) — "cleared" in the sense of "no longer open for
// change", not deleted. Flagged in CLAUDE.md as a deliberate, documented
// interpretation rather than a literal reading.
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

  const period = await prisma.sysPeriod.findUnique({ where: { PeriodID: periodId } });
  if (!period) return apiError(404, "PERIOD_NOT_FOUND");
  if (period.Status === "CLOSED") return apiError(409, "PERIOD_ALREADY_CLOSED");

  const lock = await prisma.trnPayrollLock.findFirst({ where: { PeriodID: periodId }, orderBy: { LockID: "desc" } });
  if (!lock || !lock.IsLocked) return apiError(409, "PERIOD_NOT_LOCKED", "Lock the period before closing it");

  await prisma.$transaction([
    prisma.sysPeriod.update({ where: { PeriodID: periodId }, data: { Status: "CLOSED" } }),
    prisma.trnPayrollLock.update({ where: { LockID: lock.LockID }, data: { IsLocked: true, LockedBy: user.userId, LockedDate: new Date() } }),
  ]);

  await logAction(user.userId, "PAYROLL_CLOSING", { targetTable: "sys_period", targetId: String(periodId) });
  return apiSuccess({ ok: true });
}
