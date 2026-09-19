import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Edit description/deductPerPeriod/remainingAmount. Status is no longer a
// manual OPEN/CLOSED toggle (2026-09-19, per user request) — it's derived
// automatically from remainingAmount whenever that's edited (0 -> CLOSED,
// otherwise OPEN), same convention the Inventory Return-confirm flow
// already uses for movement-origin debts. TotalAmount/PaidAmount stay
// server-driven only.
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/employees/[empCode]/installment-deductions/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "save");
  if (denied) return denied;

  const { empCode, id } = await ctx.params;
  const debtId = Number(id);
  if (!Number.isInteger(debtId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invEmployeeDebt.findUnique({ where: { DebtID: debtId } });
  if (!existing || existing.EmpCode !== empCode) return apiError(404, "DEBT_NOT_FOUND");

  let body: { description?: unknown; deductPerPeriod?: unknown; remainingAmount?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  let deductPerPeriod: number | null | undefined;
  if (body.deductPerPeriod === null || body.deductPerPeriod === "") {
    deductPerPeriod = null;
  } else if (body.deductPerPeriod !== undefined) {
    deductPerPeriod = Number(body.deductPerPeriod);
    if (!Number.isFinite(deductPerPeriod) || deductPerPeriod <= 0) {
      return apiError(400, "VALIDATION_FAILED", "deductPerPeriod must be a positive number");
    }
  }

  let remainingAmount: number | undefined;
  if (body.remainingAmount !== undefined && body.remainingAmount !== "") {
    remainingAmount = Number(body.remainingAmount);
    if (!Number.isFinite(remainingAmount) || remainingAmount < 0) {
      return apiError(400, "VALIDATION_FAILED", "remainingAmount must be a non-negative number");
    }
  }

  const updated = await prisma.invEmployeeDebt.update({
    where: { DebtID: debtId },
    data: {
      Description: body.description === null ? null : typeof body.description === "string" ? body.description.trim() || null : undefined,
      DeductPerPeriod: deductPerPeriod,
      RemainingAmount: remainingAmount,
      Status: remainingAmount !== undefined ? (remainingAmount <= 0 ? "CLOSED" : "OPEN") : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_INSTALLMENT_DEDUCTION", { targetTable: "inv_employee_debt", targetId: id });
  return apiSuccess(updated);
}

// Delete added 2026-09-19 (was intentionally omitted — "financial record").
// Still blocked for movement-origin debts (MovementID set): those tie back
// to a real Inventory Issue/Return transaction and deleting them here would
// desync that module's own accounting — must be corrected through
// Inventory instead. Manually-created debts (DeductionCode set) can be
// deleted freely.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/employees/[empCode]/installment-deductions/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "save");
  if (denied) return denied;

  const { empCode, id } = await ctx.params;
  const debtId = Number(id);
  if (!Number.isInteger(debtId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invEmployeeDebt.findUnique({ where: { DebtID: debtId } });
  if (!existing || existing.EmpCode !== empCode) return apiError(404, "DEBT_NOT_FOUND");
  if (existing.MovementID !== null) {
    return apiError(409, "MOVEMENT_ORIGIN_DEBT_CANNOT_BE_DELETED", "รายการนี้เกิดจากรายการเบิกสินค้า ต้องแก้ไขผ่านโมดูลคลังสินค้า");
  }

  await prisma.invEmployeeDebt.delete({ where: { DebtID: debtId } });
  await logAction(user.userId, "DELETE_INSTALLMENT_DEDUCTION", { targetTable: "inv_employee_debt", targetId: id });
  return apiSuccess({ ok: true });
}
