import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import MovementDocument from "../movement-document";

export default async function StockPurchasePage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "STOCK_PURCHASE", "read");
  if (!canRead) redirect("/");

  const [canSave, canApprove, canDelete, warehousesRaw, suppliersRaw, productsRaw, movementsRaw] = await Promise.all([
    hasPermission(user, "STOCK_PURCHASE", "save"),
    hasPermission(user, "STOCK_PURCHASE", "approve"),
    hasPermission(user, "STOCK_PURCHASE", "delete"),
    prisma.invWarehouse.findMany({ where: { IsActive: true }, orderBy: { WarehouseCode: "asc" } }),
    prisma.invSupplier.findMany({ where: { IsActive: true }, orderBy: { SupplierCode: "asc" } }),
    prisma.invProduct.findMany({ where: { IsActive: true }, orderBy: { ProductCode: "asc" } }),
    prisma.invStockMovement.findMany({ where: { MovementType: "PURCHASE", Status: "DRAFT" }, include: { Details: true }, orderBy: { MovementID: "desc" } }),
  ]);

  const [warehouses, suppliers, products, movements] = JSON.parse(JSON.stringify([warehousesRaw, suppliersRaw, productsRaw, movementsRaw]));

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">ซื้อสินค้า (Purchase)</h1>
      <MovementDocument
        movementType="PURCHASE"
        apiDocType="STOCK_PURCHASE"
        canSave={canSave}
        canApprove={canApprove}
        canDelete={canDelete}
        warehouses={warehouses}
        suppliers={suppliers}
        employees={[]}
        products={products}
        initialMovements={movements}
      />
    </div>
  );
}
