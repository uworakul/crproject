import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { employeeScopeWhere, companyScopeWhere } from "@/lib/employee-scope";
import InventoryReportsView from "./reports-view";

export default async function InventoryReportsPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const [canProduct, canWarehouse] = await Promise.all([hasPermission(user, "PRODUCT", "read"), hasPermission(user, "WAREHOUSE", "read")]);
  if (!canProduct || !canWarehouse) redirect("/");

  const [warehouses, categories, products, companies, sites, employees] = await Promise.all([
    prisma.invWarehouse.findMany({ where: { IsActive: true }, orderBy: { WarehouseCode: "asc" }, select: { WarehouseCode: true, WarehouseName: true } }),
    prisma.invProductCategory.findMany({ orderBy: { CategoryCode: "asc" }, select: { CategoryCode: true, CategoryName: true } }),
    prisma.invProduct.findMany({ orderBy: { ProductCode: "asc" }, select: { ProductCode: true, ProductName: true } }),
    prisma.refCompany.findMany({ where: companyScopeWhere(user), orderBy: { CompanyCode: "asc" }, select: { CompanyCode: true, CompanyName: true } }),
    prisma.mstSite.findMany({ where: { IsActive: true }, orderBy: { SiteCode: "asc" }, select: { SiteCode: true, SiteName: true } }),
    prisma.mstEmployee.findMany({ where: employeeScopeWhere(user), orderBy: { EmpCode: "asc" }, select: { EmpCode: true, FullName: true } }),
  ]);

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">รายงานสินค้าคงคลัง/เครื่องแบบ</h1>
      <InventoryReportsView warehouses={warehouses} categories={categories} products={products} companies={companies} sites={sites} employees={employees} />
    </div>
  );
}
