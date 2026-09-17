import { NextRequest } from "next/server";
import { Prisma } from "../../../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// BR-032: summarize a period's total payroll (employee count + total NetPay)
// alongside its current lock state, so the approver can review before
// locking (the lock is the gate "ควบคุมความถูกต้องก่อนโอนเงิน" — control
// correctness before the bank transfer goes out).
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_LOCK", "read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const periodId = Number(searchParams.get("periodId"));
  if (!Number.isInteger(periodId)) return apiError(400, "INVALID_PARAMS", "periodId is required and must be an integer");

  const period = await prisma.sysPeriod.findUnique({ where: { PeriodID: periodId } });
  if (!period) return apiError(404, "PERIOD_NOT_FOUND");

  const [lock, aggregate] = await Promise.all([
    prisma.trnPayrollLock.findFirst({ where: { PeriodID: periodId }, orderBy: { LockID: "desc" } }),
    prisma.trnPayrollTransaction.aggregate({ where: { PeriodID: periodId }, _count: { TransactionID: true }, _sum: { NetPay: true } }),
  ]);

  return apiSuccess({
    period,
    isLocked: lock?.IsLocked ?? false,
    lockedBy: lock?.LockedBy ?? null,
    lockedDate: lock?.LockedDate ?? null,
    employeeCount: aggregate._count.TransactionID,
    totalNetPay: (aggregate._sum.NetPay ?? new Prisma.Decimal(0)).toString(),
  });
}

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
  const updated = existing
    ? await prisma.trnPayrollLock.update({ where: { LockID: existing.LockID }, data: { IsLocked: true, LockedBy: user.userId, LockedDate: new Date() } })
    : await prisma.trnPayrollLock.create({ data: { PeriodID: periodId, IsLocked: true, LockedBy: user.userId, LockedDate: new Date() } });

  await logAction(user.userId, "PAYROLL_LOCK", { targetTable: "trn_payroll_lock", targetId: String(periodId) });
  return apiSuccess(updated);
}

export async function DELETE(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_LOCK", "approve");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const periodId = Number(searchParams.get("periodId"));
  if (!Number.isInteger(periodId)) return apiError(400, "INVALID_PARAMS", "periodId is required and must be an integer");

  const period = await prisma.sysPeriod.findUnique({ where: { PeriodID: periodId } });
  if (!period) return apiError(404, "PERIOD_NOT_FOUND");
  if (period.Status === "CLOSED") return apiError(409, "PERIOD_CLOSED", "Cannot unlock a closed period");

  const existing = await prisma.trnPayrollLock.findFirst({ where: { PeriodID: periodId }, orderBy: { LockID: "desc" } });
  if (!existing || !existing.IsLocked) return apiError(409, "NOT_LOCKED", "This period is not currently locked");

  const updated = await prisma.trnPayrollLock.update({ where: { LockID: existing.LockID }, data: { IsLocked: false, LockedBy: null, LockedDate: null } });

  await logAction(user.userId, "PAYROLL_UNLOCK", { targetTable: "trn_payroll_lock", targetId: String(periodId) });
  return apiSuccess(updated);
}
