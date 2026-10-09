import "server-only";
import { prisma } from "./prisma";

// MOBILE self-service requests (2026-10-09): an EMPLOYEE-role user can file
//   - an advance ("ขอเบิกล่วงหน้า") = a normal ADVANCE trn_request_header with
//     one detail line for themself, and
//   - a uniform purchase ("ขอเบิกชุด (ซื้อ)") = a normal inv_issue_header
//     (จำหน่ายสินค้า) with no warehouse yet — the approver picks the warehouse
//     (and cash/deduct-per-period) on the desktop issue screen before approving.
// Both are created already SUBMITTED, so they land straight in the existing
// approval queues (/requests/draft-list, /inventory/stock-count-approvals).
// A rejected document returns to DRAFT with RejectReason (same as desktop),
// and the employee can resubmit or cancel it from the phone.

/** Today's date in Thailand (UTC+7) as a UTC-midnight Date, for @db.Date columns. */
export function todayInThailand(): Date {
  return new Date(new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10));
}

export async function getMobileAdvances(empCode: string) {
  const headers = await prisma.trnRequestHeader.findMany({
    where: { DocumentCode: "ADVANCE", Details: { some: { EmpCode: empCode } } },
    include: { Details: { where: { EmpCode: empCode } } },
    orderBy: { CreatedDate: "desc" },
    take: 50,
  });
  return headers.map((h) => ({
    requestHeaderId: h.RequestHeaderID,
    documentNo: h.DocumentNo,
    requestDate: h.RequestDate.toISOString(),
    remark: h.Remark,
    status: h.Status,
    rejectReason: h.RejectReason,
    amount: Number(h.Details[0]?.Amount ?? 0),
    deductPerPeriod: Number(h.Details[0]?.DeductPerPeriod ?? 0),
  }));
}
export type MobileAdvance = Awaited<ReturnType<typeof getMobileAdvances>>[number];

export async function getMobileUniformData(empCode: string) {
  const [headers, products] = await Promise.all([
    prisma.invIssueHeader.findMany({
      where: { EmpCode: empCode },
      include: { Details: { include: { Product: { select: { ProductName: true } } }, orderBy: { IssueDetailID: "asc" } } },
      orderBy: { CreatedDate: "desc" },
      take: 50,
    }),
    prisma.invProduct.findMany({
      where: { IsActive: true, UnitPrice: { gt: 0 } },
      orderBy: { ProductCode: "asc" },
      select: { ProductCode: true, ProductName: true, UnitPrice: true, UnitOfMeasure: true },
    }),
  ]);
  return {
    products: products.map((p) => ({ productCode: p.ProductCode, productName: p.ProductName, unitPrice: Number(p.UnitPrice), unit: p.UnitOfMeasure })),
    requests: headers.map((h) => ({
      issueHeaderId: h.IssueHeaderID,
      documentNo: h.DocumentNo,
      requestDate: h.CreatedDate.toISOString(),
      remark: h.Remark,
      status: h.Status,
      rejectReason: h.RejectReason,
      total: h.Details.filter((d) => !d.IsWelfare).reduce((s, d) => s + Number(d.Amount), 0),
      lines: h.Details.map((d) => ({ productName: d.Product.ProductName, qty: Number(d.Qty), amount: Number(d.Amount) })),
    })),
  };
}
export type MobileUniformData = Awaited<ReturnType<typeof getMobileUniformData>>;
