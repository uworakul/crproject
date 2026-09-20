import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Manually-tracked secondhand quantity per (warehouse, product) — separate
// from the movement ledger on purpose (regular "จำนวน" stays computed live
// from inv_stock_movement per the approved ledger-only design; secondhand
// quantity has no equivalent concept in that ledger at all, so it gets its
// own small directly-editable table). Gated under PRODUCT, same as Category.
export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PRODUCT", "save");
  if (denied) return denied;

  let body: { warehouseCode?: unknown; productCode?: unknown; qty?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const warehouseCode = typeof body.warehouseCode === "string" ? body.warehouseCode.trim() : "";
  const productCode = typeof body.productCode === "string" ? body.productCode.trim() : "";
  if (!warehouseCode || !productCode) return apiError(400, "INVALID_PARAMS", "warehouseCode and productCode are required");

  const qty = Number(body.qty ?? 0);
  if (!Number.isFinite(qty) || qty < 0) return apiError(400, "VALIDATION_FAILED", "qty must be a non-negative number");

  const warehouse = await prisma.invWarehouse.findUnique({ where: { WarehouseCode: warehouseCode } });
  if (!warehouse) return apiError(404, "WAREHOUSE_NOT_FOUND");
  const product = await prisma.invProduct.findUnique({ where: { ProductCode: productCode } });
  if (!product) return apiError(404, "PRODUCT_NOT_FOUND");

  const existing = await prisma.invSecondhandStock.findUnique({
    where: { WarehouseCode_ProductCode: { WarehouseCode: warehouseCode, ProductCode: productCode } },
  });
  if (existing) return apiError(409, "SECONDHAND_STOCK_ALREADY_EXISTS", undefined, { warehouseCode, productCode });

  const created = await prisma.invSecondhandStock.create({
    data: { WarehouseCode: warehouseCode, ProductCode: productCode, Qty: qty, CreatedBy: user.userId },
  });
  await logAction(user.userId, "CREATE_SECONDHAND_STOCK", {
    targetTable: "inv_secondhand_stock",
    targetId: String(created.SecondhandStockID),
  });
  return apiSuccess(created, 201);
}
