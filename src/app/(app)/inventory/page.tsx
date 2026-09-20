import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import Tabs from "../reference/tabs";
import ReferenceTable, { type FieldDef } from "../reference/reference-table";

const supplierFields: FieldDef[] = [
  { key: "SupplierCode", label: "รหัสผู้ขาย", type: "text", isKey: true },
  { key: "SupplierName", label: "ชื่อผู้ขาย", type: "text" },
  { key: "Address", label: "ที่อยู่", type: "text" },
  { key: "ContactPhone", label: "เบอร์ติดต่อ", type: "text" },
];
const warehouseFields: FieldDef[] = [
  { key: "WarehouseCode", label: "รหัสคลัง", type: "text", isKey: true },
  { key: "WarehouseName", label: "ชื่อคลัง", type: "text" },
];
const categoryFields: FieldDef[] = [
  { key: "CategoryCode", label: "รหัสหมวดหมู่", type: "text", isKey: true },
  { key: "CategoryName", label: "ชื่อหมวดหมู่", type: "text" },
];

export default async function InventoryMasterPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const [canReadSupplier, canReadWarehouse, canReadProduct] = await Promise.all([
    hasPermission(user, "SUPPLIER", "read"),
    hasPermission(user, "WAREHOUSE", "read"),
    hasPermission(user, "PRODUCT", "read"),
  ]);
  if (!canReadSupplier && !canReadWarehouse && !canReadProduct) redirect("/");

  const [canSaveSupplier, canDeleteSupplier, canSaveWarehouse, canDeleteWarehouse, canSaveProduct, canDeleteProduct] = await Promise.all([
    hasPermission(user, "SUPPLIER", "save"),
    hasPermission(user, "SUPPLIER", "delete"),
    hasPermission(user, "WAREHOUSE", "save"),
    hasPermission(user, "WAREHOUSE", "delete"),
    hasPermission(user, "PRODUCT", "save"),
    hasPermission(user, "PRODUCT", "delete"),
  ]);

  // Categories are gated the same as Product (PRODUCT permission) — this
  // table only exists as the "หมวดหมู่" dropdown source for inv_product.
  const [suppliersRaw, warehousesRaw, categoriesRaw, productsRaw] = await Promise.all([
    canReadSupplier ? prisma.invSupplier.findMany({ orderBy: { SupplierCode: "asc" } }) : Promise.resolve([]),
    canReadWarehouse ? prisma.invWarehouse.findMany({ orderBy: { WarehouseCode: "asc" } }) : Promise.resolve([]),
    canReadProduct ? prisma.invProductCategory.findMany({ orderBy: { CategoryCode: "asc" } }) : Promise.resolve([]),
    canReadProduct ? prisma.invProduct.findMany({ orderBy: { ProductCode: "asc" } }) : Promise.resolve([]),
  ]);

  // UnitCost/UnitPrice are Prisma.Decimal — round-trip to plain JSON-safe values.
  const [suppliers, warehouses, categories, products] = JSON.parse(
    JSON.stringify([suppliersRaw, warehousesRaw, categoriesRaw, productsRaw]),
  );

  const productFields: FieldDef[] = [
    { key: "ProductCode", label: "รหัสสินค้า", type: "text", isKey: true },
    { key: "ProductName", label: "ชื่อสินค้า", type: "text" },
    {
      key: "CategoryCode",
      label: "หมวดหมู่",
      type: "select",
      options: categories.map((c: { CategoryCode: string; CategoryName: string }) => ({ code: c.CategoryCode, label: c.CategoryName })),
    },
    { key: "UnitCost", label: "ต้นทุน/หน่วย (บาท)", type: "number" },
    { key: "UnitPrice", label: "ราคาขาย/หน่วย (บาท)", type: "number" },
  ];

  const tabs = [];
  if (canReadSupplier) {
    tabs.push({
      label: "ผู้ขาย (Supplier)",
      content: (
        <ReferenceTable
          key="/api/inventory/suppliers"
          apiBase="/api/inventory/suppliers"
          fields={supplierFields}
          canSave={canSaveSupplier}
          canDelete={canDeleteSupplier}
          initialRows={suppliers}
        />
      ),
    });
  }
  if (canReadWarehouse) {
    tabs.push({
      label: "คลังสินค้า (Warehouse)",
      content: (
        <ReferenceTable
          key="/api/inventory/warehouses"
          apiBase="/api/inventory/warehouses"
          fields={warehouseFields}
          canSave={canSaveWarehouse}
          canDelete={canDeleteWarehouse}
          initialRows={warehouses}
        />
      ),
    });
  }
  if (canReadProduct) {
    tabs.push({
      label: "หมวดหมู่ (Category)",
      content: (
        <ReferenceTable
          key="/api/inventory/categories"
          apiBase="/api/inventory/categories"
          fields={categoryFields}
          canSave={canSaveProduct}
          canDelete={canDeleteProduct}
          allowExport
          allowImport
          initialRows={categories}
        />
      ),
    });
    tabs.push({
      label: "สินค้า (Product)",
      content: (
        <ReferenceTable
          key="/api/inventory/products"
          apiBase="/api/inventory/products"
          fields={productFields}
          canSave={canSaveProduct}
          canDelete={canDeleteProduct}
          allowExport
          allowImport
          initialRows={products}
        />
      ),
    });
  }

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">ข้อมูลหลัก</h1>
      <Tabs tabs={tabs} />
    </div>
  );
}
