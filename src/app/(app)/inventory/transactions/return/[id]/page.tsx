import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import StockReturnDetailView from "./stock-return-detail-view";

export default async function StockReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await verifySession();
  if (!user) redirect("/login");

  const { id } = await params;
  const returnId = Number(id);
  if (!Number.isInteger(returnId)) notFound();

  const canRead = await hasPermission(user, "STOCK_RETURN", "read");
  if (!canRead) redirect("/");

  const header = await prisma.invReturnHeader.findUnique({
    where: { ReturnHeaderID: returnId },
    include: {
      Warehouse: { select: { WarehouseName: true } },
      Employee: { select: { FullName: true, Site: { select: { SiteName: true } } } },
      Details: { orderBy: { ReturnDetailID: "asc" }, include: { Product: { select: { ProductName: true, UnitOfMeasure: true } } } },
    },
  });
  if (!header) notFound();

  const [canSave, canApprove, products] = await Promise.all([
    hasPermission(user, "STOCK_RETURN", "save"),
    hasPermission(user, "STOCK_RETURN", "approve"),
    prisma.invProduct.findMany({ where: { IsActive: true }, orderBy: { ProductCode: "asc" } }),
  ]);

  return (
    <div className="w-full px-6 py-8">
      <Link href="/inventory/transactions" className="text-sm text-gray-500 hover:underline">
        ← กลับบันทึกรายการสต๊อก
      </Link>
      <h1 className="mb-6 mt-2 text-lg font-semibold text-gray-900">
        คืนสินค้า {header.DocumentNo ? `#${header.DocumentNo}` : `(เอกสาร #${header.ReturnHeaderID})`}
      </h1>
      <StockReturnDetailView
        stockReturn={JSON.parse(JSON.stringify(header))}
        canSave={canSave}
        canApprove={canApprove}
        products={JSON.parse(JSON.stringify(products))}
      />
    </div>
  );
}
