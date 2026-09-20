import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import StockTransferDetailView from "./stock-transfer-detail-view";

export default async function StockTransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await verifySession();
  if (!user) redirect("/login");

  const { id } = await params;
  const transferId = Number(id);
  if (!Number.isInteger(transferId)) notFound();

  const canRead = await hasPermission(user, "STOCK_TRANSFER", "read");
  if (!canRead) redirect("/");

  const header = await prisma.invTransferHeader.findUnique({
    where: { TransferHeaderID: transferId },
    include: {
      SourceWarehouse: { select: { WarehouseName: true } },
      TargetWarehouse: { select: { WarehouseName: true } },
      Details: { orderBy: { TransferDetailID: "asc" }, include: { Product: { select: { ProductName: true, UnitOfMeasure: true } } } },
    },
  });
  if (!header) notFound();

  const [canSave, canApprove, products] = await Promise.all([
    hasPermission(user, "STOCK_TRANSFER", "save"),
    hasPermission(user, "STOCK_TRANSFER", "approve"),
    prisma.invProduct.findMany({ where: { IsActive: true }, orderBy: { ProductCode: "asc" } }),
  ]);

  return (
    <div className="w-full px-6 py-8">
      <Link href="/inventory/transactions" className="text-sm text-gray-500 hover:underline">
        ← กลับบันทึกรายการสต๊อก
      </Link>
      <h1 className="mb-6 mt-2 text-lg font-semibold text-gray-900">
        โอนสินค้า {header.DocumentNo ? `#${header.DocumentNo}` : `(เอกสาร #${header.TransferHeaderID})`}
      </h1>
      <StockTransferDetailView
        transfer={JSON.parse(JSON.stringify(header))}
        canSave={canSave}
        canApprove={canApprove}
        products={JSON.parse(JSON.stringify(products))}
      />
    </div>
  );
}
