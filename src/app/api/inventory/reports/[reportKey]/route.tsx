import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError } from "@/lib/api-response";
import { money, type ReportColumn } from "@/lib/pdf/layout";
import TableReportPdf from "@/lib/reports/pdf/table-report-pdf";
import { buildReportWorkbook, type ReportExcelColumn } from "@/lib/reports/excel-builder";
import {
  getStockBalanceReport,
  getStockCardReport,
  getWelfareReport,
  getSaleReturnSummaryReport,
  getMovementSummaryReport,
  type InvReportFilters,
  type InvReportTable,
} from "@/lib/reports/inventory-reports";

// Stock reports (2026-09-30) — GET /api/inventory/reports/[reportKey]?format=pdf|excel.
// Gated like the Stock Card tab (PRODUCT + WAREHOUSE read): these are
// cross-cutting views over every stock document type, not any one of them.
// (หนี้ค้างค่าชุด is the 6th report on this menu but is served by the payroll
// debt-report route, key "debt-uniform".)
function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/inventory/reports/[reportKey]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const deniedProduct = await requirePermission(user, "PRODUCT", "read");
  if (deniedProduct) return deniedProduct;
  const deniedWarehouse = await requirePermission(user, "WAREHOUSE", "read");
  if (deniedWarehouse) return deniedWarehouse;

  const { reportKey } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") === "excel" ? "excel" : "pdf";
  const filters: InvReportFilters = {
    warehouseCode: searchParams.get("warehouseCode") || undefined,
    categoryCode: searchParams.get("categoryCode") || undefined,
    productCode: searchParams.get("productCode") || undefined,
    startDate: parseDate(searchParams.get("startDate")),
    endDate: parseDate(searchParams.get("endDate")),
    companyCode: searchParams.get("companyCode") || undefined,
    siteCode: searchParams.get("siteCode") || undefined,
    empCode: searchParams.get("empCode") || undefined,
    allowedCompanyCodes: user.allowedCompanyCodes,
    allowedEmployeeTypes: user.allowedEmployeeTypes,
  };

  if ((reportKey === "stock-card" || reportKey === "movement-summary") && (!filters.startDate || !filters.endDate)) {
    return apiError(400, "INVALID_PARAMS", "startDate and endDate are required for this report");
  }
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    return apiError(400, "VALIDATION_FAILED", "startDate must not be after endDate");
  }
  if (reportKey === "stock-card" && (!filters.warehouseCode || !filters.productCode)) {
    return apiError(400, "INVALID_PARAMS", "warehouseCode and productCode are required for Stock Card");
  }

  let table: InvReportTable;
  try {
    if (reportKey === "stock-balance") table = await getStockBalanceReport(filters);
    else if (reportKey === "stock-card") table = await getStockCardReport(filters);
    else if (reportKey === "welfare") table = await getWelfareReport(filters);
    else if (reportKey === "sale-return") table = await getSaleReturnSummaryReport(filters);
    else if (reportKey === "movement-summary") table = await getMovementSummaryReport(filters);
    else return apiError(404, "REPORT_NOT_FOUND", undefined, { reportKey });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "WAREHOUSE_NOT_FOUND" || code === "PRODUCT_NOT_FOUND") return apiError(404, code);
    throw err;
  }

  if (format === "excel") {
    const columns: ReportExcelColumn[] = table.columns.map((c) => ({ header: c.header, key: c.key, width: Math.max(12, Math.round(c.width * 8)) }));
    const buffer = await buildReportWorkbook(table.title.slice(0, 31), columns, table.rows, table.totalRow);
    return new Response(new Uint8Array(buffer as ArrayBuffer), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${reportKey}.xlsx"` },
    });
  }

  const company = await prisma.refCompany.findFirst({ orderBy: { CompanyCode: "asc" } });
  const pdfColumns: ReportColumn[] = table.columns.map((c) => ({ key: c.key, header: c.header, width: c.width, align: c.numeric ? "right" : "left" }));
  const cell = (c: (typeof table.columns)[number], v: string | number | undefined) => (v === undefined || v === "" ? "" : c.numeric ? money(v) : v);
  const pdfRows = table.rows.map((r) => table.columns.map((c) => cell(c, r[c.key])));
  const totalRow = table.totalRow ? table.columns.map((c) => cell(c, table.totalRow![c.key])) : undefined;
  const buffer = await renderToBuffer(
    <TableReportPdf companyName={company?.CompanyName ?? ""} title={table.title} filterSummary={table.filterSummary} columns={pdfColumns} rows={pdfRows} totalRow={totalRow} orientation="landscape" />,
  );
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${reportKey}.pdf"` },
  });
}
