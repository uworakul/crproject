import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import MovementDocument from "../movement-document";

export default async function StockCountPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "STOCK_COUNT", "read");
  if (!canRead) redirect("/");

  const [canSave, canApprove, canDelete, warehousesRaw, productsRaw, movementsRaw] = await Promise.all([
    hasPermission(user, "STOCK_COUNT", "save"),
    hasPermission(user, "STOCK_COUNT", "approve"),
    hasPermission(user, "STOCK_COUNT", "delete"),
    prisma.invWarehouse.findMany({ where: { IsActive: true }, orderBy: { WarehouseCode: "asc" } }),
    prisma.invProduct.findMany({ where: { IsActive: true }, orderBy: { ProductCode: "asc" } }),
    prisma.invStockMovement.findMany({ where: { MovementType: "ADJUST", Status: "DRAFT" }, include: { Details: true }, orderBy: { MovementID: "desc" } }),
  ]);

  const [warehouses, products, movements] = JSON.parse(JSON.stringify([warehousesRaw, productsRaw, movementsRaw]));

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">ตรวจนับสต๊อก (Stock Count)</h1>
      <MovementDocument
        movementType="ADJUST"
        apiDocType="STOCK_COUNT"
        canSave={canSave}
        canApprove={canApprove}
        canDelete={canDelete}
        warehouses={warehouses}
        suppliers={[]}
        employees={[]}
        products={products}
        initialMovements={movements}
      />
    </div>
  );
}
