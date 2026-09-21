import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import StockApprovalTable from "./stock-count-approval-table";

export default async function StockApprovalsPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const [canReadCount, canReadPurchase, canReadTransfer, canReadIssue, canReadReturn] = await Promise.all([
    hasPermission(user, "STOCK_COUNT", "read"),
    hasPermission(user, "STOCK_PURCHASE", "read"),
    hasPermission(user, "STOCK_TRANSFER", "read"),
    hasPermission(user, "STOCK_ISSUE", "read"),
    hasPermission(user, "STOCK_RETURN", "read"),
  ]);
  if (!canReadCount && !canReadPurchase && !canReadTransfer && !canReadIssue && !canReadReturn) redirect("/");

  const [canApproveCount, canApprovePurchase, canApproveTransfer, canApproveIssue, canApproveReturn] = await Promise.all([
    hasPermission(user, "STOCK_COUNT", "approve"),
    hasPermission(user, "STOCK_PURCHASE", "approve"),
    hasPermission(user, "STOCK_TRANSFER", "approve"),
    hasPermission(user, "STOCK_ISSUE", "approve"),
    hasPermission(user, "STOCK_RETURN", "approve"),
  ]);

  const [countHeaders, purchaseHeaders, transferHeaders, issueHeaders, returnHeaders] = await Promise.all([
    canReadCount
      ? prisma.invStockCountHeader.findMany({
          where: { Status: "SUBMITTED" },
          include: { Details: true, Warehouse: { select: { WarehouseName: true } } },
        })
      : Promise.resolve([]),
    canReadPurchase
      ? prisma.invPurchaseHeader.findMany({
          where: { Status: "SUBMITTED" },
          include: { Details: true, Warehouse: { select: { WarehouseName: true } } },
        })
      : Promise.resolve([]),
    canReadTransfer
      ? prisma.invTransferHeader.findMany({
          where: { Status: "SUBMITTED" },
          include: { Details: true, SourceWarehouse: { select: { WarehouseName: true } }, TargetWarehouse: { select: { WarehouseName: true } } },
        })
      : Promise.resolve([]),
    canReadIssue
      ? prisma.invIssueHeader.findMany({
          where: { Status: "SUBMITTED" },
          include: { Details: true, Warehouse: { select: { WarehouseName: true } }, Employee: { select: { FullName: true } } },
        })
      : Promise.resolve([]),
    canReadReturn
      ? prisma.invReturnHeader.findMany({
          where: { Status: "SUBMITTED" },
          include: { Details: true, Warehouse: { select: { WarehouseName: true } }, Employee: { select: { FullName: true } } },
        })
      : Promise.resolve([]),
  ]);

  const rows = [
    ...countHeaders.map((r) => ({
      docType: "STOCKCOUNT" as const,
      headerId: r.StockCountHeaderID,
      documentNo: r.DocumentNo,
      warehouseLabel: `${r.WarehouseCode} — ${r.Warehouse.WarehouseName}`,
      date: r.CountDate,
      remark: r.Remark,
      itemCount: r.Details.length,
      submittedDate: r.SubmittedDate,
      detailPath: `/inventory/transactions/count/${r.StockCountHeaderID}`,
      apiBase: `/api/inventory/stock-counts/${r.StockCountHeaderID}`,
      canApprove: canApproveCount,
      empCode: null as string | null,
      empName: null as string | null,
      totalAmount: null as number | null,
    })),
    ...purchaseHeaders.map((r) => ({
      docType: "PURCHASE" as const,
      headerId: r.PurchaseHeaderID,
      documentNo: r.DocumentNo,
      warehouseLabel: `${r.WarehouseCode} — ${r.Warehouse.WarehouseName}`,
      date: r.DeliveryDate,
      remark: r.Remark,
      itemCount: r.Details.length,
      submittedDate: r.SubmittedDate,
      detailPath: `/inventory/transactions/purchase/${r.PurchaseHeaderID}`,
      apiBase: `/api/inventory/stock-purchases/${r.PurchaseHeaderID}`,
      canApprove: canApprovePurchase,
      empCode: null as string | null,
      empName: null as string | null,
      totalAmount: null as number | null,
    })),
    ...transferHeaders.map((r) => ({
      docType: "TRANSFER" as const,
      headerId: r.TransferHeaderID,
      documentNo: r.DocumentNo,
      warehouseLabel: `${r.SourceWarehouseCode} — ${r.SourceWarehouse.WarehouseName} → ${r.TargetWarehouseCode} — ${r.TargetWarehouse.WarehouseName}`,
      date: r.DeliveryDate,
      remark: r.Remark,
      itemCount: r.Details.length,
      submittedDate: r.SubmittedDate,
      detailPath: `/inventory/transactions/transfer/${r.TransferHeaderID}`,
      apiBase: `/api/inventory/stock-transfers/${r.TransferHeaderID}`,
      canApprove: canApproveTransfer,
      empCode: null as string | null,
      empName: null as string | null,
      totalAmount: null as number | null,
    })),
    ...issueHeaders.map((r) => ({
      docType: "ISSUE" as const,
      headerId: r.IssueHeaderID,
      documentNo: r.DocumentNo,
      warehouseLabel: `${r.WarehouseCode} — ${r.Warehouse.WarehouseName}`,
      date: r.DeliveryDate,
      remark: r.Remark,
      itemCount: r.Details.length,
      submittedDate: r.SubmittedDate,
      detailPath: `/inventory/transactions/issue/${r.IssueHeaderID}`,
      apiBase: `/api/inventory/stock-issues/${r.IssueHeaderID}`,
      canApprove: canApproveIssue,
      empCode: r.EmpCode as string | null,
      empName: r.Employee.FullName as string | null,
      // "ยอดเงินรวม (ไม่รวมสวัสดิการ)" — same convention as the detail page's total.
      totalAmount: r.Details.filter((d) => !d.IsWelfare).reduce((sum, d) => sum + Number(d.Amount), 0) as number | null,
    })),
    ...returnHeaders.map((r) => ({
      docType: "RETURN" as const,
      headerId: r.ReturnHeaderID,
      documentNo: r.DocumentNo,
      warehouseLabel: `${r.WarehouseCode} — ${r.Warehouse.WarehouseName}`,
      date: r.DeliveryDate,
      remark: r.Remark,
      itemCount: r.Details.length,
      submittedDate: r.SubmittedDate,
      detailPath: `/inventory/transactions/return/${r.ReturnHeaderID}`,
      apiBase: `/api/inventory/stock-returns/${r.ReturnHeaderID}`,
      canApprove: canApproveReturn,
      empCode: r.EmpCode as string | null,
      empName: r.Employee.FullName as string | null,
      totalAmount: r.Details.reduce((sum, d) => sum + Number(d.Amount), 0) as number | null,
    })),
  ].sort((a, b) => {
    const at = a.submittedDate ? new Date(a.submittedDate).getTime() : 0;
    const bt = b.submittedDate ? new Date(b.submittedDate).getTime() : 0;
    return at - bt;
  });

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">รายการรออนุมัติ (Stock)</h1>
      <StockApprovalTable rows={JSON.parse(JSON.stringify(rows))} />
    </div>
  );
}
