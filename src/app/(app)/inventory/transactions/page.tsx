import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { getStockBalancesForWarehouse } from "@/lib/inventory";
import Tabs from "../../reference/tabs";
import StockSummaryView, { type StockSummaryRow } from "../stock-summary-view";
import StockCountListView from "./stock-count-list-view";
import StockPurchaseListView from "./stock-purchase-list-view";
import StockTransferListView from "./stock-transfer-list-view";
import StockIssueListView from "./stock-issue-list-view";
import StockReturnListView from "./stock-return-list-view";

export default async function InventoryTransactionsPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const [canReadCount, canReadPurchase, canReadTransfer, canReadIssue, canReadReturn, canReadProduct, canReadWarehouse] = await Promise.all([
    hasPermission(user, "STOCK_COUNT", "read"),
    hasPermission(user, "STOCK_PURCHASE", "read"),
    hasPermission(user, "STOCK_TRANSFER", "read"),
    hasPermission(user, "STOCK_ISSUE", "read"),
    hasPermission(user, "STOCK_RETURN", "read"),
    hasPermission(user, "PRODUCT", "read"),
    hasPermission(user, "WAREHOUSE", "read"),
  ]);
  const canReadStockSummary = canReadProduct && canReadWarehouse;
  if (!canReadCount && !canReadPurchase && !canReadTransfer && !canReadIssue && !canReadReturn && !canReadStockSummary) redirect("/");

  const [
    canSaveCount,
    canDeleteCount,
    canSavePurchase,
    canDeletePurchase,
    canSaveTransfer,
    canDeleteTransfer,
    canSaveIssue,
    canDeleteIssue,
    canSaveReturn,
    canDeleteReturn,
  ] = await Promise.all([
    hasPermission(user, "STOCK_COUNT", "save"),
    hasPermission(user, "STOCK_COUNT", "delete"),
    hasPermission(user, "STOCK_PURCHASE", "save"),
    hasPermission(user, "STOCK_PURCHASE", "delete"),
    hasPermission(user, "STOCK_TRANSFER", "save"),
    hasPermission(user, "STOCK_TRANSFER", "delete"),
    hasPermission(user, "STOCK_ISSUE", "save"),
    hasPermission(user, "STOCK_ISSUE", "delete"),
    hasPermission(user, "STOCK_RETURN", "save"),
    hasPermission(user, "STOCK_RETURN", "delete"),
  ]);

  const [warehousesRaw, suppliersRaw, employeesRaw, productsRaw, categoriesRaw, stockCountHeadersRaw, stockPurchaseHeadersRaw, stockTransferHeadersRaw, stockIssueHeadersRaw, stockReturnHeadersRaw] =
    await Promise.all([
      prisma.invWarehouse.findMany({ where: { IsActive: true }, orderBy: { WarehouseCode: "asc" } }),
      canReadPurchase ? prisma.invSupplier.findMany({ where: { IsActive: true }, orderBy: { SupplierCode: "asc" } }) : Promise.resolve([]),
      canReadIssue || canReadReturn
        ? prisma.mstEmployee.findMany({ where: { EmployeeStatus: "ACTIVE" }, orderBy: { EmpCode: "asc" }, select: { EmpCode: true, FullName: true } })
        : Promise.resolve([]),
      prisma.invProduct.findMany({ where: { IsActive: true }, orderBy: { ProductCode: "asc" } }),
      prisma.invProductCategory.findMany({ where: { IsActive: true }, orderBy: { CategoryCode: "asc" } }),
      canReadCount ? prisma.invStockCountHeader.findMany({ include: { Details: true, Warehouse: { select: { WarehouseName: true } } }, orderBy: { CreatedDate: "desc" } }) : Promise.resolve([]),
      canReadPurchase
        ? prisma.invPurchaseHeader.findMany({
            include: { Details: true, Warehouse: { select: { WarehouseName: true } }, Supplier: { select: { SupplierName: true } } },
            orderBy: { CreatedDate: "desc" },
          })
        : Promise.resolve([]),
      canReadTransfer
        ? prisma.invTransferHeader.findMany({
            include: { Details: true, SourceWarehouse: { select: { WarehouseName: true } }, TargetWarehouse: { select: { WarehouseName: true } } },
            orderBy: { CreatedDate: "desc" },
          })
        : Promise.resolve([]),
      canReadIssue
        ? prisma.invIssueHeader.findMany({
            include: { Details: true, Warehouse: { select: { WarehouseName: true } }, Employee: { select: { FullName: true, Site: { select: { SiteName: true } } } } },
            orderBy: { CreatedDate: "desc" },
          })
        : Promise.resolve([]),
      canReadReturn
        ? prisma.invReturnHeader.findMany({
            include: { Details: true, Warehouse: { select: { WarehouseName: true } }, Employee: { select: { FullName: true, Site: { select: { SiteName: true } } } } },
            orderBy: { CreatedDate: "desc" },
          })
        : Promise.resolve([]),
    ]);

  const [
    warehouses,
    suppliers,
    employees,
    categories,
    stockCountHeaders,
    stockPurchaseHeaders,
    stockTransferHeaders,
    stockIssueHeaders,
    stockReturnHeaders,
  ] = JSON.parse(
    JSON.stringify([
      warehousesRaw,
      suppliersRaw,
      employeesRaw,
      categoriesRaw,
      stockCountHeadersRaw,
      stockPurchaseHeadersRaw,
      stockTransferHeadersRaw,
      stockIssueHeadersRaw,
      stockReturnHeadersRaw,
    ]),
  );

  // Same stock-summary row building as before (moved here from
  // inventory/page.tsx along with the tab itself).
  let stockSummaryRows: StockSummaryRow[] = [];
  if (canReadStockSummary) {
    const [secondhandRowsRaw, activeWarehouses] = await Promise.all([
      prisma.invSecondhandStock.findMany(),
      prisma.invWarehouse.findMany({ where: { IsActive: true }, orderBy: { WarehouseCode: "asc" } }),
    ]);

    const productInfo = new Map(
      productsRaw.map((p) => [p.ProductCode, { name: p.ProductName, categoryCode: p.CategoryCode, unitOfMeasure: p.UnitOfMeasure }]),
    );
    const categoryNames = new Map(categoriesRaw.map((c) => [c.CategoryCode, c.CategoryName]));
    const warehouseNames = new Map(activeWarehouses.map((w) => [w.WarehouseCode, w.WarehouseName]));
    const secondhandByKey = new Map(secondhandRowsRaw.map((r) => [`${r.WarehouseCode}::${r.ProductCode}`, r]));

    const rows: StockSummaryRow[] = [];
    const seenKeys = new Set<string>();

    for (const wh of activeWarehouses) {
      const balances = await getStockBalancesForWarehouse(wh.WarehouseCode);
      for (const [productCode, balance] of balances) {
        if (balance.isZero()) continue;
        const product = productInfo.get(productCode);
        if (!product) continue;
        const key = `${wh.WarehouseCode}::${productCode}`;
        seenKeys.add(key);
        const secondhand = secondhandByKey.get(key);
        rows.push({
          warehouseCode: wh.WarehouseCode,
          warehouseName: wh.WarehouseName,
          categoryCode: product.categoryCode,
          categoryName: product.categoryCode ? (categoryNames.get(product.categoryCode) ?? null) : null,
          productCode,
          productName: product.name,
          qty: balance.toString(),
          secondHandQty: secondhand ? secondhand.Qty.toString() : "0",
          secondhandStockId: secondhand ? secondhand.SecondhandStockID : null,
          unitOfMeasure: product.unitOfMeasure,
        });
      }
    }

    for (const r of secondhandRowsRaw) {
      const key = `${r.WarehouseCode}::${r.ProductCode}`;
      if (seenKeys.has(key)) continue;
      const product = productInfo.get(r.ProductCode);
      const warehouseName = warehouseNames.get(r.WarehouseCode);
      if (!product || !warehouseName) continue;
      rows.push({
        warehouseCode: r.WarehouseCode,
        warehouseName,
        categoryCode: product.categoryCode,
        categoryName: product.categoryCode ? (categoryNames.get(product.categoryCode) ?? null) : null,
        productCode: r.ProductCode,
        productName: product.name,
        qty: "0",
        secondHandQty: r.Qty.toString(),
        secondhandStockId: r.SecondhandStockID,
        unitOfMeasure: product.unitOfMeasure,
      });
    }

    stockSummaryRows = rows;
  }

  const tabs = [];
  if (canReadCount) {
    tabs.push({
      label: "ตรวจนับสต๊อก",
      content: (
        <StockCountListView
          key="/api/inventory/stock-counts"
          initialRows={stockCountHeaders}
          warehouses={warehouses}
          canSave={canSaveCount}
          canDelete={canDeleteCount}
        />
      ),
    });
  }
  if (canReadPurchase) {
    tabs.push({
      label: "ซื้อสินค้า",
      content: (
        <StockPurchaseListView
          key="/api/inventory/stock-purchases"
          initialRows={stockPurchaseHeaders}
          warehouses={warehouses}
          suppliers={suppliers}
          canSave={canSavePurchase}
          canDelete={canDeletePurchase}
        />
      ),
    });
  }
  if (canReadTransfer) {
    tabs.push({
      label: "โอนสินค้า",
      content: (
        <StockTransferListView
          key="/api/inventory/stock-transfers"
          initialRows={stockTransferHeaders}
          warehouses={warehouses}
          canSave={canSaveTransfer}
          canDelete={canDeleteTransfer}
        />
      ),
    });
  }
  if (canReadIssue) {
    tabs.push({
      label: "จำหน่าย",
      content: (
        <StockIssueListView
          key="/api/inventory/stock-issues"
          initialRows={stockIssueHeaders}
          warehouses={warehouses}
          employees={employees}
          canSave={canSaveIssue}
          canDelete={canDeleteIssue}
        />
      ),
    });
  }
  if (canReadReturn) {
    tabs.push({
      label: "คืนสินค้า",
      content: (
        <StockReturnListView
          key="/api/inventory/stock-returns"
          initialRows={stockReturnHeaders}
          warehouses={warehouses}
          employees={employees}
          canSave={canSaveReturn}
          canDelete={canDeleteReturn}
        />
      ),
    });
  }
  if (canReadStockSummary) {
    tabs.push({
      label: "สินค้าคงเหลือ",
      content: (
        <StockSummaryView
          key="/api/inventory/secondhand-stock"
          initialRows={stockSummaryRows}
          warehouses={warehouses.map((w: { WarehouseCode: string; WarehouseName: string }) => ({ code: w.WarehouseCode, label: `${w.WarehouseCode} — ${w.WarehouseName}` }))}
          categories={categories.map((c: { CategoryCode: string; CategoryName: string }) => ({ code: c.CategoryCode, label: `${c.CategoryCode} — ${c.CategoryName}` }))}
        />
      ),
    });
  }

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">บันทึกรายการสต๊อก</h1>
      <Tabs tabs={tabs} />
    </div>
  );
}
