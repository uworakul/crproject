import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getStockBalancesForWarehouse } from "@/lib/inventory";

// Read-only stock-on-hand view, derived from the CONFIRMED movement ledger.
// Any authenticated user can view balances (no single DocumentType owns
// "stock levels" — it's a cross-cutting view used from several movement
// screens to show what's available before confirming an outbound movement).
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { searchParams } = new URL(request.url);
  const warehouseCode = searchParams.get("warehouse");
  if (!warehouseCode) return apiError(400, "INVALID_PARAMS", "warehouse is required");

  const warehouse = await prisma.invWarehouse.findUnique({ where: { WarehouseCode: warehouseCode } });
  if (!warehouse) return apiError(404, "WAREHOUSE_NOT_FOUND");

  const products = await prisma.invProduct.findMany({ where: { IsActive: true }, orderBy: { ProductCode: "asc" } });
  const balances = await getStockBalancesForWarehouse(warehouseCode);

  const result = products.map((p) => ({
    productCode: p.ProductCode,
    productName: p.ProductName,
    category: p.Category,
    onHand: (balances.get(p.ProductCode) ?? 0).toString(),
  }));

  return apiSuccess(result);
}
