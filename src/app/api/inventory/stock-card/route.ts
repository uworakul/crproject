import { NextRequest } from "next/server";
import { Prisma } from "../../../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getStockCardEntries, MOVEMENT_TYPE_LABELS } from "@/lib/inventory";

// "ตรวจสอบการเคลื่อนไหว" Stock Card (2026-09-29) — gated the same as the
// "สินค้าคงเหลือ" tab it sits next to (needs both PRODUCT and WAREHOUSE read,
// since it's a cross-cutting view over every stock document type rather than
// belonging to any single one of them).
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const deniedProduct = await requirePermission(user, "PRODUCT", "read");
  if (deniedProduct) return deniedProduct;
  const deniedWarehouse = await requirePermission(user, "WAREHOUSE", "read");
  if (deniedWarehouse) return deniedWarehouse;

  const { searchParams } = new URL(request.url);
  const warehouseCode = searchParams.get("warehouseCode")?.trim() ?? "";
  const productCode = searchParams.get("productCode")?.trim() ?? "";
  const startDateRaw = searchParams.get("startDate") ?? "";
  const endDateRaw = searchParams.get("endDate") ?? "";
  if (!warehouseCode || !productCode || !startDateRaw || !endDateRaw) {
    return apiError(400, "INVALID_PARAMS", "warehouseCode, productCode, startDate and endDate are required");
  }

  const startDate = new Date(startDateRaw);
  const endDate = new Date(endDateRaw);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return apiError(400, "VALIDATION_FAILED", "startDate/endDate must be valid dates");
  }
  if (startDate > endDate) {
    return apiError(400, "VALIDATION_FAILED", "startDate must not be after endDate");
  }

  const [warehouse, product] = await Promise.all([
    prisma.invWarehouse.findUnique({ where: { WarehouseCode: warehouseCode } }),
    prisma.invProduct.findUnique({ where: { ProductCode: productCode } }),
  ]);
  if (!warehouse) return apiError(404, "WAREHOUSE_NOT_FOUND", undefined, { warehouseCode });
  if (!product) return apiError(404, "PRODUCT_NOT_FOUND", undefined, { productCode });

  // One query up to endDate, then split into "before startDate" (folds into
  // the opening balance) vs. "within range" (shown as line items) — avoids
  // two separate DB round-trips and keeps the split logic (and its date
  // boundary) in one place.
  const allEntries = await getStockCardEntries(productCode, warehouseCode, endDate);

  const warehouseCodes = new Set(allEntries.map((e) => e.counterWarehouseCode).filter((c): c is string => c !== null));
  const counterWarehouses = warehouseCodes.size
    ? await prisma.invWarehouse.findMany({ where: { WarehouseCode: { in: [...warehouseCodes] } }, select: { WarehouseCode: true, WarehouseName: true } })
    : [];
  const counterWarehouseNames = new Map(counterWarehouses.map((w) => [w.WarehouseCode, w.WarehouseName]));

  // Valued at the product's current weighted-average UnitCost, NOT each
  // movement's own recorded UnitPrice/Amount (2026-09-29 fix, reported live:
  // "สต๊อกห้ามติดลบ" — the running มูลค่า balance went negative while qty
  // stayed positive). The original design summed each line's own
  // transaction price, but that's not a coherent value ledger: ADJUST
  // (ตรวจนับสต๊อก) lines never carry a price at all (UnitPrice=0 — a count
  // correction isn't a sale or purchase), while ISSUE lines carry the SALE
  // price. Mixing free/zero-priced inflows against a real sale price on
  // outflows can drive the running balance negative even with plenty of
  // qty on hand. A real stock card needs one consistent cost basis for
  // every line so มูลค่าคงเหลือ moves in lockstep with จำนวนคงเหลือ — this
  // product's current UnitCost (already the app's one source of truth for
  // "what a unit of this product is worth," updated on Purchase-approve) is
  // applied uniformly across the whole date range, not tracked historically
  // (there's no historical cost field anywhere else in this schema either).
  const unitCost = product.UnitCost;

  let openingQty = new Prisma.Decimal(0);
  let openingAmount = new Prisma.Decimal(0);
  const rows: {
    movementId: number;
    movementDate: string;
    movementType: string;
    movementTypeLabel: string;
    direction: "IN" | "OUT";
    qty: string;
    unitPrice: string;
    amount: string;
    counterWarehouseCode: string | null;
    counterWarehouseName: string | null;
    balanceQty: string;
    balanceAmount: string;
  }[] = [];

  let runningQty = new Prisma.Decimal(0);
  let runningAmount = new Prisma.Decimal(0);
  for (const e of allEntries) {
    const valueMagnitude = e.qty.mul(unitCost);
    const signedQty = e.direction === "IN" ? e.qty : e.qty.neg();
    const signedAmount = e.direction === "IN" ? valueMagnitude : valueMagnitude.neg();
    if (e.movementDate < startDate) {
      openingQty = openingQty.add(signedQty);
      openingAmount = openingAmount.add(signedAmount);
      runningQty = runningQty.add(signedQty);
      runningAmount = runningAmount.add(signedAmount);
      continue;
    }
    runningQty = runningQty.add(signedQty);
    runningAmount = runningAmount.add(signedAmount);
    rows.push({
      movementId: e.movementId,
      movementDate: e.movementDate.toISOString().slice(0, 10),
      movementType: e.movementType,
      movementTypeLabel: MOVEMENT_TYPE_LABELS[e.movementType],
      direction: e.direction,
      qty: e.qty.toFixed(2),
      unitPrice: unitCost.toFixed(2),
      amount: valueMagnitude.toFixed(2),
      counterWarehouseCode: e.counterWarehouseCode,
      counterWarehouseName: e.counterWarehouseCode ? (counterWarehouseNames.get(e.counterWarehouseCode) ?? e.counterWarehouseCode) : null,
      balanceQty: runningQty.toFixed(2),
      balanceAmount: runningAmount.toFixed(2),
    });
  }

  return apiSuccess({
    warehouseCode,
    warehouseName: warehouse.WarehouseName,
    productCode,
    productName: product.ProductName,
    opening: { qty: openingQty.toFixed(2), amount: openingAmount.toFixed(2) },
    closing: { qty: runningQty.toFixed(2), amount: runningAmount.toFixed(2) },
    rows,
  });
}
