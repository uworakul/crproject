import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getStockBalancesForWarehouse } from "@/lib/inventory";

// Approve = mark APPROVED + post the counted results, all in one DB
// transaction. "จำนวน" (regular qty) stays ledger-derived per the approved
// design (see the สินค้าคงเหลือ tab's own "แก้ไข" flow) — approving here
// creates+confirms one ADJUST inv_stock_movement per line, for only the
// delta between what was counted and the live ledger balance at approval
// time (never an absolute "set to X"). "จำนวนสินค้ามือสอง" is upserted into
// inv_secondhand_stock directly, same table the สินค้าคงเหลือ tab reads.
export async function POST(_req: Request, ctx: RouteContext<"/api/inventory/stock-counts/[id]/approve">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_COUNT", "approve");
  if (denied) return denied;

  const { id } = await ctx.params;
  const stockCountId = Number(id);
  if (!Number.isInteger(stockCountId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invStockCountHeader.findUnique({
    where: { StockCountHeaderID: stockCountId },
    include: { Details: true },
  });
  if (!existing) return apiError(404, "STOCK_COUNT_NOT_FOUND");

  if (existing.Status !== "SUBMITTED") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a SUBMITTED stock count can be approved", { currentStatus: existing.Status });
  }
  if (existing.Details.length === 0) {
    return apiError(422, "NO_DETAIL_ROWS", "This stock count has no product lines to approve");
  }

  // Balances and secondhand rows are computed once, up front, the same way
  // Worksheet's approveWorksheet() reads outside the transaction and only
  // writes inside it — the delta each line needs is fixed at this moment.
  const balances = await getStockBalancesForWarehouse(existing.WarehouseCode);
  const secondhandRows = await prisma.invSecondhandStock.findMany({ where: { WarehouseCode: existing.WarehouseCode } });
  const secondhandByProduct = new Map(secondhandRows.map((r) => [r.ProductCode, r]));

  const updated = await prisma.$transaction(async (tx) => {
    const header = await tx.invStockCountHeader.update({
      where: { StockCountHeaderID: stockCountId },
      data: { Status: "APPROVED", ApprovedBy: user.userId, ApprovedDate: new Date(), UpdatedBy: user.userId, UpdatedDate: new Date() },
    });

    for (const line of existing.Details) {
      const currentQty = balances.get(line.ProductCode);
      const delta = currentQty ? line.CountedQty.sub(currentQty) : line.CountedQty;
      if (!delta.isZero()) {
        await tx.invStockMovement.create({
          data: {
            MovementType: "ADJUST",
            WarehouseCode: existing.WarehouseCode,
            MovementDate: new Date(),
            Status: "CONFIRMED",
            CreatedBy: user.userId,
            UpdatedBy: user.userId,
            UpdatedDate: new Date(),
            Details: { create: [{ ProductCode: line.ProductCode, Qty: delta, UnitPrice: 0, Amount: 0 }] },
          },
        });
      }

      const secondhand = secondhandByProduct.get(line.ProductCode);
      if (secondhand) {
        if (!secondhand.Qty.equals(line.CountedSecondHandQty)) {
          await tx.invSecondhandStock.update({
            where: { SecondhandStockID: secondhand.SecondhandStockID },
            data: { Qty: line.CountedSecondHandQty, UpdatedBy: user.userId, UpdatedDate: new Date() },
          });
        }
      } else if (!line.CountedSecondHandQty.isZero()) {
        await tx.invSecondhandStock.create({
          data: { WarehouseCode: existing.WarehouseCode, ProductCode: line.ProductCode, Qty: line.CountedSecondHandQty, CreatedBy: user.userId },
        });
      }
    }

    return header;
  });

  await logAction(user.userId, "APPROVE_STOCK_COUNT", { targetTable: "inv_stock_count_header", targetId: id });
  return apiSuccess(updated);
}
