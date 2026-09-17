import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Fields the Transaction screen can edit directly (allowances, OT, manual
// deductions, other income/deduction). TaxWithheld/SSOAmount are owned by
// Calculate, not editable here — WorkDays/DoubleShiftDays/HolidayDays/
// GrossWage are owned by Worksheet approve.
const EDITABLE_FIELDS = [
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

  const merged = { ...existing, ...data };
  const netPay =
    Number(merged.GrossWage) -
    Number(merged.TaxWithheld) -
    Number(merged.SSOAmount) -
    Number(merged.AdvanceDeduct) -
    Number(merged.LoanDeduct) -
    Number(merged.TrainingDeduct) -
    Number(merged.UniformDeduct) +
    Number(merged.OtherIncome) -
    Number(merged.OtherDeduction);

  const updated = await prisma.trnPayrollTransaction.update({
    where: { TransactionID: transactionId },
    data: { ...data, NetPay: netPay },
  });

  await logAction(user.userId, "UPDATE_PAYROLL_TRANSACTION", { targetTable: "trn_payroll_transaction", targetId: String(transactionId) });
  return apiSuccess(updated);
}
