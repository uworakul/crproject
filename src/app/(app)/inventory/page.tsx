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
const productFields: FieldDef[] = [
  { key: "ProductCode", label: "รหัสสินค้า", type: "text", isKey: true },
  { key: "ProductName", label: "ชื่อสินค้า", type: "text" },
  { key: "Category", label: "หมวดหมู่", type: "text" },
  { key: "UnitCost", label: "ต้นทุน/หน่วย (บาท)", type: "number" },
  { key: "UnitPrice", label: "ราคาขาย/หน่วย (บาท)", type: "number" },
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

  const [suppliersRaw, warehousesRaw, productsRaw] = await Promise.all([
    canReadSupplier ? prisma.invSupplier.findMany({ orderBy: { SupplierCode: "asc" } }) : Promise.resolve([]),
    canReadWarehouse ? prisma.invWarehouse.findMany({ orderBy: { WarehouseCode: "asc" } }) : Promise.resolve([]),
    canReadProduct ? prisma.invProduct.findMany({ orderBy: { ProductCode: "asc" } }) : Promise.resolve([]),
  ]);

  // UnitCost/UnitPrice are Prisma.Decimal — round-trip to plain JSON-safe values.
  const [suppliers, warehouses, products] = JSON.parse(JSON.stringify([suppliersRaw, warehousesRaw, productsRaw]));

  const tabs = [];
  if (canReadSupplier) {
    tabs.push({
      label: "ผู้ขาย (Supplier)",
      content: (
        <ReferenceTable
          key="/api/inventory/suppliers"
          apiBase="/api/inventory/suppliers"
          fields={supplierFields}
          hasIsActive
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
          hasIsActive
          canSave={canSaveWarehouse}
          canDelete={canDeleteWarehouse}
          initialRows={warehouses}
        />
      ),
    });
  }
  if (canReadProduct) {
    tabs.push({
      label: "สินค้า (Product)",
      content: (
        <ReferenceTable
          key="/api/inventory/products"
          apiBase="/api/inventory/products"
          fields={productFields}
          hasIsActive
          canSave={canSaveProduct}
          canDelete={canDeleteProduct}
          initialRows={products}
        />
      ),
    });
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">ข้อมูลหลักคลังสินค้า</h1>
      <Tabs tabs={tabs} />
    </div>
  );
}
