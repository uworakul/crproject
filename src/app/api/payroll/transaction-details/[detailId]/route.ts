import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { recomputeTransactionOtherTotals } from "@/lib/payroll";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/payroll/transaction-details/[detailId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_TRANSACTION", "save");
  if (denied) return denied;

  const { detailId } = await ctx.params;
  const id = Number(detailId);
  if (!Number.isInteger(id)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.trnPayrollTransactionDetail.findUnique({ where: { DetailID: id } });
  if (!existing) return apiError(404, "TRANSACTION_DETAIL_NOT_FOUND");

  const transaction = await prisma.trnPayrollTransaction.findUnique({ where: { TransactionID: existing.TransactionID } });
  const lock = transaction ? await prisma.trnPayrollLock.findFirst({ where: { PeriodID: transaction.PeriodID, IsLocked: true } }) : null;
  if (lock) return apiError(409, "PERIOD_LOCKED", "This period is locked and cannot be edited");

  let body: { hours?: unknown; days?: unknown; amount?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const amount = body.amount !== undefined ? Number(body.amount) : Number(existing.Amount);
  const hours = body.hours !== undefined ? (body.hours === "" || body.hours === null ? null : Number(body.hours)) : existing.Hours !== null ? Number(existing.Hours) : null;
  const days = body.days !== undefined ? (body.days === "" || body.days === null ? null : Number(body.days)) : existing.Days !== null ? Number(existing.Days) : null;

  if (!Number.isFinite(amount) || amount < 0) return apiError(400, "VALIDATION_FAILED", "amount must be a non-negative number");
  if (hours !== null && (!Number.isFinite(hours) || hours < 0)) return apiError(400, "VALIDATION_FAILED", "hours must be a non-negative number");
  if (days !== null && (!Number.isFinite(days) || days < 0)) return apiError(400, "VALIDATION_FAILED", "days must be a non-negative number");

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.trnPayrollTransactionDetail.update({
      where: { DetailID: id },
      data: { Hours: hours, Days: days, Amount: amount, UpdatedBy: user.userId, UpdatedDate: new Date() },
    });
    await recomputeTransactionOtherTotals(tx, existing.TransactionID, user.userId);
    return row;
  });

  await logAction(user.userId, "UPDATE_PAYROLL_TRANSACTION_DETAIL", { targetTable: "trn_payroll_transaction_detail", targetId: detailId });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/payroll/transaction-details/[detailId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_TRANSACTION", "save");
  if (denied) return denied;

  const { detailId } = await ctx.params;
  const id = Number(detailId);
  if (!Number.isInteger(id)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.trnPayrollTransactionDetail.findUnique({ where: { DetailID: id } });
  if (!existing) return apiError(404, "TRANSACTION_DETAIL_NOT_FOUND");

  const transaction = await prisma.trnPayrollTransaction.findUnique({ where: { TransactionID: existing.TransactionID } });
  const lock = transaction ? await prisma.trnPayrollLock.findFirst({ where: { PeriodID: transaction.PeriodID, IsLocked: true } }) : null;
  if (lock) return apiError(409, "PERIOD_LOCKED", "This period is locked and cannot be edited");

  await prisma.$transaction(async (tx) => {
    await tx.trnPayrollTransactionDetail.delete({ where: { DetailID: id } });
    await recomputeTransactionOtherTotals(tx, existing.TransactionID, user.userId);
  });

  await logAction(user.userId, "DELETE_PAYROLL_TRANSACTION_DETAIL", { targetTable: "trn_payroll_transaction_detail", targetId: detailId });
  return apiSuccess({ ok: true });
}
