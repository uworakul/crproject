import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { decimalOf, minDecimal } from "@/lib/inventory";

// Approve = mark APPROVED + post the return, all in one DB transaction.
// Regular lines post as one RETURN inv_stock_movement (adds back to the
// receiving warehouse); secondhand lines increment inv_secondhand_stock
// directly. The full return value is then applied as a payment against the
// employee's OPEN "UNIFORM" debt — same apply-to-RemainingAmount mechanic
// the original ISSUE/RETURN movement-confirm flow already used for
// movement-linked debts (min(value, RemainingAmount), move that amount from
// RemainingAmount into PaidAmount, close if it hits 0). If no OPEN UNIFORM
// debt exists for this employee, there's nothing to reduce — skipped
// silently, the stock movement still posts normally.
export async function POST(_req: Request, ctx: RouteContext<"/api/inventory/stock-returns/[id]/approve">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_RETURN", "approve");
  if (denied) return denied;

  const { id } = await ctx.params;
  const returnId = Number(id);
  if (!Number.isInteger(returnId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invReturnHeader.findUnique({
    where: { ReturnHeaderID: returnId },
    include: { Details: true },
  });
  if (!existing) return apiError(404, "STOCK_RETURN_NOT_FOUND");

  if (existing.Status !== "SUBMITTED") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a SUBMITTED return can be approved", { currentStatus: existing.Status });
  }
  if (existing.Details.length === 0) {
    return apiError(422, "NO_DETAIL_ROWS", "This return has no product lines to approve");
  }

  const regularLines = existing.Details.filter((d) => !d.IsSecondHand);
  const secondHandLines = existing.Details.filter((d) => d.IsSecondHand);
  const totalAmount = existing.Details.reduce((sum, d) => sum + Number(d.Amount), 0);

  const updated = await prisma.$transaction(async (tx) => {
    const header = await tx.invReturnHeader.update({
      where: { ReturnHeaderID: returnId },
      data: { Status: "APPROVED", ApprovedBy: user.userId, ApprovedDate: new Date(), UpdatedBy: user.userId, UpdatedDate: new Date() },
    });

    if (regularLines.length > 0) {
      await tx.invStockMovement.create({
        data: {
          MovementType: "RETURN",
          WarehouseCode: existing.WarehouseCode,
          EmpCode: existing.EmpCode,
          MovementDate: existing.DeliveryDate,
          Status: "CONFIRMED",
          CreatedBy: user.userId,
          UpdatedBy: user.userId,
          UpdatedDate: new Date(),
          Details: { create: regularLines.map((d) => ({ ProductCode: d.ProductCode, Qty: d.Qty, UnitPrice: d.UnitPrice, Amount: d.Amount })) },
        },
      });
    }

    for (const line of secondHandLines) {
      const row = await tx.invSecondhandStock.findUnique({
        where: { WarehouseCode_ProductCode: { WarehouseCode: existing.WarehouseCode, ProductCode: line.ProductCode } },
      });
      if (row) {
        await tx.invSecondhandStock.update({
          where: { SecondhandStockID: row.SecondhandStockID },
          data: { Qty: row.Qty.add(line.Qty), UpdatedBy: user.userId, UpdatedDate: new Date() },
        });
      } else {
        await tx.invSecondhandStock.create({
          data: { WarehouseCode: existing.WarehouseCode, ProductCode: line.ProductCode, Qty: line.Qty, CreatedBy: user.userId },
        });
      }
    }

    if (totalAmount > 0) {
      const openDebt = await tx.invEmployeeDebt.findFirst({
        where: { EmpCode: existing.EmpCode, DeductionCode: "UNIFORM", Status: "OPEN" },
      });
      if (openDebt) {
        const applied = minDecimal(decimalOf(totalAmount), openDebt.RemainingAmount);
        const newRemaining = openDebt.RemainingAmount.sub(applied);
        const newPaid = openDebt.PaidAmount.add(applied);
        await tx.invEmployeeDebt.update({
          where: { DebtID: openDebt.DebtID },
          data: {
            RemainingAmount: newRemaining,
            PaidAmount: newPaid,
            Status: newRemaining.lte(0) ? "CLOSED" : "OPEN",
            UpdatedBy: user.userId,
            UpdatedDate: new Date(),
          },
        });
      }
    }

    return header;
  });

  await logAction(user.userId, "APPROVE_STOCK_RETURN", { targetTable: "inv_return_header", targetId: id });
  return apiSuccess(updated);
}
