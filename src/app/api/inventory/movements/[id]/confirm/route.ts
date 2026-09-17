import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { decimalOf, getStockBalance, isOutboundLine, minDecimal, MOVEMENT_TYPE_DOCTYPE, sumAmounts, type MovementType } from "@/lib/inventory";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/inventory/movements/[id]/confirm">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const movementId = Number(id);
  if (!Number.isInteger(movementId)) return apiError(400, "INVALID_PARAMS", "id must be an integer");

  const movement = await prisma.invStockMovement.findUnique({ where: { MovementID: movementId }, include: { Details: true } });
  if (!movement) return apiError(404, "MOVEMENT_NOT_FOUND");
  const type = movement.MovementType as MovementType;

  const denied = await requirePermission(user, MOVEMENT_TYPE_DOCTYPE[type], "approve");
  if (denied) return denied;

  if (movement.Status !== "DRAFT") return apiError(409, "INVALID_STATUS_TRANSITION", "Only DRAFT movements can be confirmed", { currentStatus: movement.Status });
  if (movement.Details.length === 0) return apiError(422, "MOVEMENT_EMPTY", "Cannot confirm a movement with no detail lines");

  let body: { paidAmount?: unknown; debtId?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // no body is fine — paidAmount/debtId are both optional
  }

  // Stock sufficiency check for outbound lines (aggregate by product first,
  // since one movement could list the same product on more than one line).
  const outboundByProduct = new Map<string, ReturnType<typeof decimalOf>>();
  for (const d of movement.Details) {
    if (isOutboundLine(type, d.Qty)) {
      const qtyOut = d.Qty.abs();
      outboundByProduct.set(d.ProductCode, (outboundByProduct.get(d.ProductCode) ?? decimalOf(0)).add(qtyOut));
    }
  }
  for (const [productCode, qtyOut] of outboundByProduct) {
    const balance = await getStockBalance(movement.WarehouseCode, productCode);
    if (balance.lt(qtyOut)) {
      return apiError(422, "INSUFFICIENT_STOCK", undefined, { productCode, warehouseCode: movement.WarehouseCode, available: balance.toString(), requested: qtyOut.toString() });
    }
  }

  let debtCreated: unknown = null;
  let debtUpdated: unknown = null;

  if (type === "ISSUE") {
    const totalAmount = sumAmounts(movement.Details);
    const paidAmountNum = Number(body.paidAmount ?? 0);
    if (!Number.isFinite(paidAmountNum) || paidAmountNum < 0) return apiError(400, "VALIDATION_FAILED", "paidAmount must be a non-negative number");
    const paidAmount = decimalOf(paidAmountNum);
    if (paidAmount.gt(totalAmount)) return apiError(400, "VALIDATION_FAILED", "paidAmount cannot exceed the movement total", { totalAmount: totalAmount.toString() });
    const remainingAmount = totalAmount.sub(paidAmount);

    const [, debt] = await prisma.$transaction([
      prisma.invStockMovement.update({
        where: { MovementID: movementId },
        data: { Status: "CONFIRMED", UpdatedBy: user.userId, UpdatedDate: new Date() },
      }),
      remainingAmount.gt(0)
        ? prisma.invEmployeeDebt.create({
            data: {
              EmpCode: movement.EmpCode!,
              MovementID: movementId,
              TotalAmount: totalAmount,
              PaidAmount: paidAmount,
              RemainingAmount: remainingAmount,
              Status: "OPEN",
              CreatedBy: user.userId,
            },
          })
        : prisma.invStockMovement.findUnique({ where: { MovementID: movementId } }),
    ]);
    if (remainingAmount.gt(0)) debtCreated = debt;
  } else if (type === "RETURN") {
    const debtId = body.debtId !== undefined && body.debtId !== null ? Number(body.debtId) : null;
    if (debtId !== null) {
      if (!Number.isInteger(debtId)) return apiError(400, "INVALID_PARAMS", "debtId must be an integer");
      const debt = await prisma.invEmployeeDebt.findUnique({ where: { DebtID: debtId } });
      if (!debt) return apiError(404, "DEBT_NOT_FOUND");
      if (debt.EmpCode !== movement.EmpCode) return apiError(422, "DEBT_EMPLOYEE_MISMATCH", undefined, { debtEmpCode: debt.EmpCode, movementEmpCode: movement.EmpCode });
      if (debt.Status !== "OPEN") return apiError(422, "DEBT_NOT_OPEN", undefined, { status: debt.Status });

      const returnValue = sumAmounts(movement.Details);
      const applied = minDecimal(returnValue, debt.RemainingAmount);
      const newRemaining = debt.RemainingAmount.sub(applied);
      const newPaid = debt.PaidAmount.add(applied);

      const [, updatedDebt] = await prisma.$transaction([
        prisma.invStockMovement.update({
          where: { MovementID: movementId },
          data: { Status: "CONFIRMED", UpdatedBy: user.userId, UpdatedDate: new Date() },
        }),
        prisma.invEmployeeDebt.update({
          where: { DebtID: debtId },
          data: {
            RemainingAmount: newRemaining,
            PaidAmount: newPaid,
            Status: newRemaining.lte(0) ? "CLOSED" : "OPEN",
            UpdatedBy: user.userId,
            UpdatedDate: new Date(),
          },
        }),
      ]);
      debtUpdated = updatedDebt;
    } else {
      await prisma.invStockMovement.update({
        where: { MovementID: movementId },
        data: { Status: "CONFIRMED", UpdatedBy: user.userId, UpdatedDate: new Date() },
      });
    }
  } else {
    await prisma.invStockMovement.update({
      where: { MovementID: movementId },
      data: { Status: "CONFIRMED", UpdatedBy: user.userId, UpdatedDate: new Date() },
    });
  }

  await logAction(user.userId, `CONFIRM_${type}_MOVEMENT`, { targetTable: "inv_stock_movement", targetId: String(movementId) });

  const updated = await prisma.invStockMovement.findUnique({
    where: { MovementID: movementId },
    include: { Details: true, Warehouse: true, TargetWarehouse: true, Supplier: true, Employee: true },
  });
  return apiSuccess({ movement: updated, debtCreated, debtUpdated });
}
