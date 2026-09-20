import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getTotalStockBalance } from "@/lib/inventory";

// Approve = mark APPROVED + post the purchase, all in one DB transaction.
// Unlike ตรวจนับสต๊อก (one ADJUST movement per line, since each line needs
// its own delta against the live ledger), every purchase line simply adds
// its full Qty to the same receiving warehouse — no delta needed — so all
// lines post together as ONE PURCHASE inv_stock_movement. Each line also
// recalculates its product's UnitCost as a weighted average against that
// product's current total on-hand qty across every warehouse (per the
// user's explicit choice — see CLAUDE.md), not just the receiving warehouse,
// since inv_product.UnitCost is a single company-wide field.
export async function POST(_req: Request, ctx: RouteContext<"/api/inventory/stock-purchases/[id]/approve">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_PURCHASE", "approve");
  if (denied) return denied;

  const { id } = await ctx.params;
  const purchaseId = Number(id);
  if (!Number.isInteger(purchaseId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invPurchaseHeader.findUnique({
    where: { PurchaseHeaderID: purchaseId },
    include: { Details: true },
  });
  if (!existing) return apiError(404, "STOCK_PURCHASE_NOT_FOUND");

  if (existing.Status !== "SUBMITTED") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a SUBMITTED purchase can be approved", { currentStatus: existing.Status });
  }
  if (existing.Details.length === 0) {
    return apiError(422, "NO_DETAIL_ROWS", "This purchase has no product lines to approve");
  }

  // Current total balance + cost read once, up front, same convention as
  // Worksheet's approveWorksheet() and the stock-count approve route.
  const productCodes = [...new Set(existing.Details.map((d) => d.ProductCode))];
  const products = await prisma.invProduct.findMany({ where: { ProductCode: { in: productCodes } } });
  const productByCode = new Map(products.map((p) => [p.ProductCode, p]));
  const currentBalances = new Map<string, Awaited<ReturnType<typeof getTotalStockBalance>>>();
  for (const code of productCodes) currentBalances.set(code, await getTotalStockBalance(code));

  const updated = await prisma.$transaction(async (tx) => {
    const header = await tx.invPurchaseHeader.update({
      where: { PurchaseHeaderID: purchaseId },
      data: { Status: "APPROVED", ApprovedBy: user.userId, ApprovedDate: new Date(), UpdatedBy: user.userId, UpdatedDate: new Date() },
    });

    await tx.invStockMovement.create({
      data: {
        MovementType: "PURCHASE",
        WarehouseCode: existing.WarehouseCode,
        SupplierCode: existing.SupplierCode,
        MovementDate: existing.DeliveryDate,
        Status: "CONFIRMED",
        CreatedBy: user.userId,
        UpdatedBy: user.userId,
        UpdatedDate: new Date(),
        Details: {
          create: existing.Details.map((d) => ({ ProductCode: d.ProductCode, Qty: d.Qty, UnitPrice: d.UnitPrice, Amount: d.Amount })),
        },
      },
    });

    for (const line of existing.Details) {
      const product = productByCode.get(line.ProductCode)!;
      const existingQty = currentBalances.get(line.ProductCode)!;
      const newQtyTotal = existingQty.add(line.Qty);
      // newQtyTotal is always > 0 here (line.Qty > 0 is enforced on every
      // detail line), so no divide-by-zero guard is needed.
      const newCost = existingQty.mul(product.UnitCost).add(line.Qty.mul(line.UnitPrice)).div(newQtyTotal);
      await tx.invProduct.update({
        where: { ProductCode: line.ProductCode },
        data: { UnitCost: newCost, UpdatedBy: user.userId, UpdatedDate: new Date() },
      });
    }

    return header;
  });

  await logAction(user.userId, "APPROVE_STOCK_PURCHASE", { targetTable: "inv_purchase_header", targetId: id });
  return apiSuccess(updated);
}
