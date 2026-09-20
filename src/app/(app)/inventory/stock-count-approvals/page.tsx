import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import StockCountApprovalTable from "./stock-count-approval-table";

export default async function StockCountApprovalsPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "STOCK_COUNT", "read");
  if (!canRead) redirect("/");

  const canApprove = await hasPermission(user, "STOCK_COUNT", "approve");

  const rows = await prisma.invStockCountHeader.findMany({
    where: { Status: "SUBMITTED" },
    include: { Details: true, Warehouse: { select: { WarehouseName: true } } },
    orderBy: { SubmittedDate: "asc" },
  });

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">รายการรออนุมัติ (ตรวจนับสต๊อก)</h1>
      <StockCountApprovalTable rows={JSON.parse(JSON.stringify(rows))} canApprove={canApprove} />
    </div>
  );
}
