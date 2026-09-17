import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import MovementDocument from "../movement-document";

export default async function StockTransferPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "STOCK_TRANSFER", "read");
  if (!canRead) redirect("/");

  const [canSave, canApprove, canDelete, warehousesRaw, productsRaw, movementsRaw] = await Promise.all([
    hasPermission(user, "STOCK_TRANSFER", "save"),
    hasPermission(user, "STOCK_TRANSFER", "approve"),
    hasPermission(user, "STOCK_TRANSFER", "delete"),
    prisma.invWarehouse.findMany({ where: { IsActive: true }, orderBy: { WarehouseCode: "asc" } }),
    prisma.invProduct.findMany({ where: { IsActive: true }, orderBy: { ProductCode: "asc" } }),
    prisma.invStockMovement.findMany({ where: { MovementType: "TRANSFER", Status: "DRAFT" }, include: { Details: true }, orderBy: { MovementID: "desc" } }),
  ]);

  const [warehouses, products, movements] = JSON.parse(JSON.stringify([warehousesRaw, productsRaw, movementsRaw]));

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">โอนสินค้าระหว่างคลัง (Transfer)</h1>
      <MovementDocument
        movementType="TRANSFER"
        apiDocType="STOCK_TRANSFER"
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
