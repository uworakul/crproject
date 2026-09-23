import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// "อนุมัติ" (2026-09-24) — the second, distinct step after "ส่งขออนุมัติ"
// (Lock): a period must already be locked before it can be approved, and
// closePeriod() now requires both IsLocked and IsApproved. Reverting either
// state (locked-not-approved, or locked-and-approved) back to fully
// editable is the single "ตีคืน" action on DELETE /api/payroll/lock — there
// is no separate "un-approve but stay locked" step.
export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_LOCK", "approve");
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

  const existing = await prisma.trnPayrollLock.findFirst({ where: { PeriodID: periodId }, orderBy: { LockID: "desc" } });
  if (!existing || !existing.IsLocked) return apiError(409, "PERIOD_NOT_LOCKED", "Lock (ส่งขออนุมัติ) the period before it can be approved");
  if (existing.IsApproved) return apiError(409, "PERIOD_ALREADY_APPROVED");

  const updated = await prisma.trnPayrollLock.update({
    where: { LockID: existing.LockID },
    data: { IsApproved: true, ApprovedBy: user.userId, ApprovedDate: new Date(), UpdatedBy: user.userId, UpdatedDate: new Date() },
  });

  await logAction(user.userId, "PAYROLL_APPROVE", { targetTable: "trn_payroll_lock", targetId: String(periodId) });
  return apiSuccess(updated);
}
