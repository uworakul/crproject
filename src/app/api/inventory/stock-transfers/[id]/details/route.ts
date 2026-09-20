import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getStockBalance } from "@/lib/inventory";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/inventory/stock-transfers/[id]/details">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_TRANSFER", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const transferId = Number(id);
  if (!Number.isInteger(transferId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.invTransferHeader.findUnique({ where: { TransferHeaderID: transferId } });
  if (!header) return apiError(404, "STOCK_TRANSFER_NOT_FOUND");
  if (header.Status === "APPROVED") {
    return apiError(409, "STOCK_TRANSFER_LOCKED", "An APPROVED transfer can no longer be edited", { status: header.Status });
  }

  let body: { productCode?: unknown; qty?: unknown; secondHandQty?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const productCode = typeof body.productCode === "string" ? body.productCode.trim() : "";
  const qty = Number(body.qty);
  const secondHandQty = Number(body.secondHandQty ?? 0);
  if (!productCode || !Number.isFinite(qty) || qty < 0 || !Number.isFinite(secondHandQty) || secondHandQty < 0) {
    return apiError(400, "INVALID_PARAMS", "productCode, qty (>=0), and secondHandQty (>=0) are required");
  }
  if (qty <= 0 && secondHandQty <= 0) {
    return apiError(400, "VALIDATION_FAILED", "qty or secondHandQty must be greater than 0");
  }

  const product = await prisma.invProduct.findUnique({ where: { ProductCode: productCode } });
  if (!product) return apiError(404, "PRODUCT_NOT_FOUND", undefined, { productCode });

  const existingDetails = await prisma.invTransferDetail.findMany({
    where: { TransferHeaderID: transferId },
    orderBy: { TransferDetailID: "asc" },
    select: { ProductCode: true },
  });
  const existingIndex = existingDetails.findIndex((d) => d.ProductCode === productCode);
  if (existingIndex !== -1) {
    return apiError(409, "PRODUCT_ALREADY_IN_TRANSFER", `มีรายการนี้แล้ว ในลำดับที่ ${existingIndex + 1}`, { productCode });
  }

  // Check against the source warehouse's live balance up front (not just at
  // approve time) so the person entering the transfer finds out immediately,
  // not after submit/approve.
  if (qty > 0) {
    const balance = await getStockBalance(header.SourceWarehouseCode, productCode);
    if (balance.lt(qty)) {
      return apiError(422, "INSUFFICIENT_STOCK", `สินค้าคงเหลือไม่พอ (คงเหลือ ${balance.toString()})`, {
        productCode,
        warehouseCode: header.SourceWarehouseCode,
        available: balance.toString(),
        requested: qty,
      });
    }
  }
  if (secondHandQty > 0) {
    const secondhand = await prisma.invSecondhandStock.findUnique({
      where: { WarehouseCode_ProductCode: { WarehouseCode: header.SourceWarehouseCode, ProductCode: productCode } },
    });
    const available = secondhand?.Qty ?? 0;
    if (Number(available) < secondHandQty) {
      return apiError(422, "INSUFFICIENT_SECONDHAND_STOCK", `สินค้ามือสองคงเหลือไม่พอ (คงเหลือ ${available.toString()})`, {
        productCode,
        warehouseCode: header.SourceWarehouseCode,
        available: available.toString(),
        requested: secondHandQty,
      });
    }
  }

  const created = await prisma.invTransferDetail.create({
    data: { TransferHeaderID: transferId, ProductCode: productCode, Qty: qty, SecondHandQty: secondHandQty, CreatedBy: user.userId },
  });

  await logAction(user.userId, "ADD_STOCK_TRANSFER_DETAIL", {
    targetTable: "inv_transfer_detail",
    targetId: String(created.TransferDetailID),
    detail: `Transfer ${transferId}, product ${productCode}`,
  });

  return apiSuccess({ ...created, Product: { ProductName: product.ProductName, UnitOfMeasure: product.UnitOfMeasure } }, 201);
}
