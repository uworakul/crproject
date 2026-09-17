import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import MovementDocument from "../movement-document";

export default async function StockReturnPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "STOCK_RETURN", "read");
  if (!canRead) redirect("/");

  const [canSave, canApprove, canDelete, warehousesRaw, employeesRaw, productsRaw, movementsRaw] = await Promise.all([
    hasPermission(user, "STOCK_RETURN", "save"),
    hasPermission(user, "STOCK_RETURN", "approve"),
    hasPermission(user, "STOCK_RETURN", "delete"),
    prisma.invWarehouse.findMany({ where: { IsActive: true }, orderBy: { WarehouseCode: "asc" } }),
    prisma.mstEmployee.findMany({ where: { EmployeeStatus: "ACTIVE" }, orderBy: { EmpCode: "asc" }, select: { EmpCode: true, FullName: true } }),
    prisma.invProduct.findMany({ where: { IsActive: true }, orderBy: { ProductCode: "asc" } }),
    prisma.invStockMovement.findMany({ where: { MovementType: "RETURN", Status: "DRAFT" }, include: { Details: true }, orderBy: { MovementID: "desc" } }),
  ]);

  const [warehouses, employees, products, movements] = JSON.parse(JSON.stringify([warehousesRaw, employeesRaw, productsRaw, movementsRaw]));

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">คืนสินค้า (Return)</h1>
      <MovementDocument
        movementType="RETURN"
        apiDocType="STOCK_RETURN"
        canSave={canSave}
        canApprove={canApprove}
        canDelete={canDelete}
        warehouses={warehouses}
        suppliers={[]}
        employees={employees}
        products={products}
        initialMovements={movements}
      />
    </div>
  );
}
