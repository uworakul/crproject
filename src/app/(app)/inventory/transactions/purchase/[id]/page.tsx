import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import StockPurchaseDetailView from "./stock-purchase-detail-view";

export default async function StockPurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await verifySession();
  if (!user) redirect("/login");

  const { id } = await params;
  const purchaseId = Number(id);
  if (!Number.isInteger(purchaseId)) notFound();

  const canRead = await hasPermission(user, "STOCK_PURCHASE", "read");
  if (!canRead) redirect("/");

  const header = await prisma.invPurchaseHeader.findUnique({
    where: { PurchaseHeaderID: purchaseId },
    include: {
      Warehouse: { select: { WarehouseName: true } },
      Supplier: { select: { SupplierName: true } },
      Details: { orderBy: { PurchaseDetailID: "asc" }, include: { Product: { select: { ProductName: true, UnitOfMeasure: true, UnitCost: true } } } },
    },
  });
  if (!header) notFound();

  const [canSave, canApprove, products] = await Promise.all([
    hasPermission(user, "STOCK_PURCHASE", "save"),
    hasPermission(user, "STOCK_PURCHASE", "approve"),
    prisma.invProduct.findMany({ where: { IsActive: true }, orderBy: { ProductCode: "asc" } }),
  ]);

  return (
    <div className="w-full px-6 py-8">
      <Link href="/inventory/transactions" className="text-sm text-gray-500 hover:underline">
        ← กลับบันทึกรายการสต๊อก
      </Link>
      <h1 className="mb-6 mt-2 text-lg font-semibold text-gray-900">
        ซื้อสินค้า {header.DocumentNo ? `#${header.DocumentNo}` : `(เอกสาร #${header.PurchaseHeaderID})`}
      </h1>
      <StockPurchaseDetailView
        purchase={JSON.parse(JSON.stringify(header))}
        canSave={canSave}
        canApprove={canApprove}
        products={JSON.parse(JSON.stringify(products))}
      />
    </div>
  );
}
