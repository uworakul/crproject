import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { recomputeTransactionOtherTotals } from "@/lib/payroll";

// Fields the Transaction screen can edit directly (allowances, OT, manual
// deductions, other income/deduction). TaxWithheld/SSOAmount are owned by
// Calculate, not editable here — DoubleShiftDays/HolidayDays/GrossWage are
// owned by Worksheet approve. WorkDays is the one exception (2026-09-21,
// "คำนวณเงินได้ประจำงวด" screen — "แสดงจำนวนวันทำงาน แต่ให้สามารถแก้ไขได้"):
// editable here as a manual correction, but this does NOT recompute
// GrossWage (no day-rate formula was specified for that — GrossWage stays
// whatever Worksheet last posted until Worksheet is re-approved).
const EDITABLE_FIELDS = [
  "WorkDays",
  "OTHours",
  "OTAmount",
  "PositionAllowance",
  "ShiftAllowance",
  "AdvanceDeduct",
  "LoanDeduct",
  "TrainingDeduct",
  "UniformDeduct",
  "OtherIncome",
  "OtherDeduction",
] as const;

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/payroll/transactions/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_TRANSACTION", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const transactionId = Number(id);
  if (!Number.isInteger(transactionId)) return apiError(400, "INVALID_PARAMS", "id must be an integer");

  const existing = await prisma.trnPayrollTransaction.findUnique({ where: { TransactionID: transactionId } });
  if (!existing) return apiError(404, "TRANSACTION_NOT_FOUND");

  const lock = await prisma.trnPayrollLock.findFirst({ where: { PeriodID: existing.PeriodID, IsLocked: true } });
  if (lock) return apiError(409, "PERIOD_LOCKED", "This period is locked and cannot be edited");

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const data: Record<string, number> = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    const n = Number(body[field]);
    if (!Number.isFinite(n)) return apiError(400, "VALIDATION_FAILED", `${field} must be a number`);
    data[field] = n;
  }

  // 2026-09-22: NetPay (and the priority-rationed AdvanceDeduct/UniformDeduct/
  // LoanDeduct/TrainingDeduct/OtherDeduction/OtherIncome values that feed it)
  // is now computed by the shared recomputeTransactionOtherTotals() engine —
  // see src/lib/payroll.ts for the "ลำดับการหักเงิน"/"ยอดหักสุทธิ ต้องไม่ติดลบ"
  // rules. Note this means a direct OtherIncome/OtherDeduction edit here gets
  // immediately re-derived from trn_payroll_transaction_detail afterward —
  // already-documented pre-existing behavior (this screen's edits to those
  // two fields were already only ever a temporary override until the next
  // detail-line change elsewhere overwrote them; this just makes that happen
  // synchronously instead of on some later unrelated action).
  const updated = await prisma.$transaction(async (tx) => {
    await tx.trnPayrollTransaction.update({
      where: { TransactionID: transactionId },
      data: { ...data, UpdatedBy: user.userId, UpdatedDate: new Date() },
    });
    await recomputeTransactionOtherTotals(tx, transactionId, user.userId);
    return tx.trnPayrollTransaction.findUniqueOrThrow({ where: { TransactionID: transactionId } });
  });

  await logAction(user.userId, "UPDATE_PAYROLL_TRANSACTION", { targetTable: "trn_payroll_transaction", targetId: String(transactionId) });
  return apiSuccess(updated);
}

// 2026-09-21, "รายการประจำงวด" list — removes an employee from this period
// entirely (their detail lines go with it). Recoverable: re-approving their
// Worksheet, or "+ เพิ่มพนักงาน" on the list screen, recreates the row.
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/payroll/transactions/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_TRANSACTION", "delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  const transactionId = Number(id);
  if (!Number.isInteger(transactionId)) return apiError(400, "INVALID_PARAMS", "id must be an integer");

  const existing = await prisma.trnPayrollTransaction.findUnique({ where: { TransactionID: transactionId } });
  if (!existing) return apiError(404, "TRANSACTION_NOT_FOUND");

  const lock = await prisma.trnPayrollLock.findFirst({ where: { PeriodID: existing.PeriodID, IsLocked: true } });
  if (lock) return apiError(409, "PERIOD_LOCKED", "This period is locked and cannot be edited");

  await prisma.$transaction([
    prisma.trnPayrollTransactionDetail.deleteMany({ where: { TransactionID: transactionId } }),
    prisma.trnPayrollTransaction.delete({ where: { TransactionID: transactionId } }),
  ]);

  await logAction(user.userId, "DELETE_PAYROLL_TRANSACTION", { targetTable: "trn_payroll_transaction", targetId: String(transactionId) });
  return apiSuccess({ ok: true });
}
