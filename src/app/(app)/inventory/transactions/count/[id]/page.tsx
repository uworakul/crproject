import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { getStockBalancesForWarehouse } from "@/lib/inventory";
import StockCountDetailView from "./stock-count-detail-view";

export default async function StockCountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await verifySession();
  if (!user) redirect("/login");

  const { id } = await params;
  const stockCountId = Number(id);
  if (!Number.isInteger(stockCountId)) notFound();

  const canRead = await hasPermission(user, "STOCK_COUNT", "read");
  if (!canRead) redirect("/");

  const header = await prisma.invStockCountHeader.findUnique({
    where: { StockCountHeaderID: stockCountId },
    include: {
      Warehouse: { select: { WarehouseName: true } },
      Details: { orderBy: { StockCountDetailID: "asc" }, include: { Product: { select: { ProductName: true, UnitOfMeasure: true } } } },
    },
  });
  if (!header) notFound();

  const [canSave, canApprove, products, secondhandRows, balances] = await Promise.all([
    hasPermission(user, "STOCK_COUNT", "save"),
    hasPermission(user, "STOCK_COUNT", "approve"),
    prisma.invProduct.findMany({ where: { IsActive: true }, orderBy: { ProductCode: "asc" } }),
    prisma.invSecondhandStock.findMany({ where: { WarehouseCode: header.WarehouseCode } }),
    getStockBalancesForWarehouse(header.WarehouseCode),
  ]);

  const currentQtyByProduct: Record<string, string> = {};
  for (const [productCode, balance] of balances) currentQtyByProduct[productCode] = balance.toString();
  const currentSecondHandByProduct: Record<string, string> = {};
  for (const r of secondhandRows) currentSecondHandByProduct[r.ProductCode] = r.Qty.toString();

  return (
    <div className="w-full px-6 py-8">
      <Link href="/inventory/transactions" className="text-sm text-gray-500 hover:underline">
        ← กลับบันทึกรายการสต๊อก
      </Link>
      <h1 className="mb-6 mt-2 text-lg font-semibold text-gray-900">
        ตรวจนับสต๊อก {header.DocumentNo ? `#${header.DocumentNo}` : `(เอกสาร #${header.StockCountHeaderID})`}
      </h1>
      <StockCountDetailView
        stockCount={JSON.parse(JSON.stringify(header))}
        canSave={canSave}
        canApprove={canApprove}
        products={JSON.parse(JSON.stringify(products))}
        currentQtyByProduct={currentQtyByProduct}
        currentSecondHandByProduct={currentSecondHandByProduct}
      />
    </div>
  );
}
