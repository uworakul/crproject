import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getStockBalance } from "@/lib/inventory";

// Approve = mark APPROVED + post the transfer, all in one DB transaction.
// Every line moves qty from the same source warehouse to the same target
// warehouse, so — like Purchase — all lines post together as ONE TRANSFER
// inv_stock_movement (no per-line delta needed). SecondHandQty moves
// directly between the two warehouses' inv_secondhand_stock rows (not part
// of the movement ledger), sufficiency-checked the same way regular qty is.
export async function POST(_req: Request, ctx: RouteContext<"/api/inventory/stock-transfers/[id]/approve">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_TRANSFER", "approve");
  if (denied) return denied;

  const { id } = await ctx.params;
  const transferId = Number(id);
  if (!Number.isInteger(transferId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invTransferHeader.findUnique({
    where: { TransferHeaderID: transferId },
    include: { Details: true },
  });
  if (!existing) return apiError(404, "STOCK_TRANSFER_NOT_FOUND");

  if (existing.Status !== "SUBMITTED") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a SUBMITTED transfer can be approved", { currentStatus: existing.Status });
  }
  if (existing.Details.length === 0) {
    return apiError(422, "NO_DETAIL_ROWS", "This transfer has no product lines to approve");
  }

  // Sufficiency checks up front — regular qty against the ledger, secondhand
  // qty against inv_secondhand_stock — before any writes happen.
  for (const line of existing.Details) {
    if (Number(line.Qty) > 0) {
      const balance = await getStockBalance(existing.SourceWarehouseCode, line.ProductCode);
      if (balance.lt(line.Qty)) {
        return apiError(422, "INSUFFICIENT_STOCK", undefined, {
          productCode: line.ProductCode,
          warehouseCode: existing.SourceWarehouseCode,
          available: balance.toString(),
          requested: line.Qty.toString(),
        });
      }
    }
    if (Number(line.SecondHandQty) > 0) {
      const secondhand = await prisma.invSecondhandStock.findUnique({
        where: { WarehouseCode_ProductCode: { WarehouseCode: existing.SourceWarehouseCode, ProductCode: line.ProductCode } },
      });
      const available = secondhand?.Qty ?? line.SecondHandQty.sub(line.SecondHandQty); // 0 with matching precision when no row exists
      if (available.lt(line.SecondHandQty)) {
        return apiError(422, "INSUFFICIENT_SECONDHAND_STOCK", undefined, {
          productCode: line.ProductCode,
          warehouseCode: existing.SourceWarehouseCode,
          available: available.toString(),
          requested: line.SecondHandQty.toString(),
        });
      }
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const header = await tx.invTransferHeader.update({
      where: { TransferHeaderID: transferId },
      data: { Status: "APPROVED", ApprovedBy: user.userId, ApprovedDate: new Date(), UpdatedBy: user.userId, UpdatedDate: new Date() },
    });

    await tx.invStockMovement.create({
      data: {
        MovementType: "TRANSFER",
        WarehouseCode: existing.SourceWarehouseCode,
        TargetWarehouseCode: existing.TargetWarehouseCode,
        MovementDate: existing.DeliveryDate,
        Status: "CONFIRMED",
        CreatedBy: user.userId,
        UpdatedBy: user.userId,
        UpdatedDate: new Date(),
        Details: {
          create: existing.Details.filter((d) => Number(d.Qty) > 0).map((d) => ({ ProductCode: d.ProductCode, Qty: d.Qty, UnitPrice: 0, Amount: 0 })),
        },
      },
    });

    for (const line of existing.Details) {
      if (Number(line.SecondHandQty) <= 0) continue;

      const sourceRow = await tx.invSecondhandStock.findUnique({
        where: { WarehouseCode_ProductCode: { WarehouseCode: existing.SourceWarehouseCode, ProductCode: line.ProductCode } },
      });
      await tx.invSecondhandStock.update({
        where: { SecondhandStockID: sourceRow!.SecondhandStockID },
        data: { Qty: sourceRow!.Qty.sub(line.SecondHandQty), UpdatedBy: user.userId, UpdatedDate: new Date() },
      });

      const targetRow = await tx.invSecondhandStock.findUnique({
        where: { WarehouseCode_ProductCode: { WarehouseCode: existing.TargetWarehouseCode, ProductCode: line.ProductCode } },
      });
      if (targetRow) {
        await tx.invSecondhandStock.update({
          where: { SecondhandStockID: targetRow.SecondhandStockID },
          data: { Qty: targetRow.Qty.add(line.SecondHandQty), UpdatedBy: user.userId, UpdatedDate: new Date() },
        });
      } else {
        await tx.invSecondhandStock.create({
          data: { WarehouseCode: existing.TargetWarehouseCode, ProductCode: line.ProductCode, Qty: line.SecondHandQty, CreatedBy: user.userId },
        });
      }
    }

    return header;
  });

  await logAction(user.userId, "APPROVE_STOCK_TRANSFER", { targetTable: "inv_transfer_header", targetId: id });
  return apiSuccess(updated);
}
