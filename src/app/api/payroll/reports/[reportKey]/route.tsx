import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError } from "@/lib/api-response";
import type { ReportFilters } from "@/lib/reports/types";
import { getPayslipRows, getBankRemittanceRows, getPaySummaryMatrix } from "@/lib/reports/payroll-reports";
import { DEBT_REPORT_CATEGORIES, getDebtRows, type DebtReportKey } from "@/lib/reports/debt-reports";
import { getEmployeeRegistryRows, getEmployeeCards, EMPLOYEE_CARD_SECTIONS, type EmployeeCardSection } from "@/lib/reports/employee-reports";
import { getSsoRemitMonthlyRows, getSsoRemitCheckRows, getWelfareFundRemitRows, getWithholdingTaxRows, getAnnualTaxSummaryRows } from "@/lib/reports/government-reports";
import { buildReportWorkbook, type ReportExcelColumn } from "@/lib/reports/excel-builder";
import { money, type ReportColumn } from "@/lib/pdf/layout";
import TableReportPdf from "@/lib/reports/pdf/table-report-pdf";
import PayslipPdf from "@/lib/reports/pdf/payslip-pdf";
import EmployeeCardPdf from "@/lib/reports/pdf/employee-card-pdf";
import { parseGroupBy, parseSortBy, parseSortDir, sortRows, groupRows, buildGroupedRows, buildGroupedExcelRows, sumField, type GroupByField, type SortByField, type SortDir, type GroupableRow, type RowGroup } from "@/lib/reports/group-sort";

// Single dispatcher for every /payroll/reports report (2026-09-22) —
// GET /api/payroll/reports/[reportKey]?format=pdf|excel&<filters>. One
// route file rather than one per report x format since the shape is
// identical: parse filters, load the same data either format would need,
// hand it to the matching PDF component or a plain columns+rows table for
// Excel. Every report key shares the same PAYROLL_REPORT read permission
// (this screen is a single unit, not gated per-button).
const DEBT_KEYS: Record<string, DebtReportKey> = { "debt-advance": "ADVANCE", "debt-training": "TRAINING", "debt-insurance": "INSURANCE", "debt-loan": "LOAN" };

function parseFilters(searchParams: URLSearchParams): ReportFilters {
  const periodIdRaw = searchParams.get("periodId");
  const yearRaw = searchParams.get("year");
  const monthRaw = searchParams.get("month");
  return {
    periodId: periodIdRaw ? Number(periodIdRaw) : undefined,
    year: yearRaw ? Number(yearRaw) : undefined,
    month: monthRaw ? Number(monthRaw) : undefined,
    companyCode: searchParams.get("companyCode") || undefined,
    deptCode: searchParams.get("deptCode") || undefined,
    siteCode: searchParams.get("siteCode") || undefined,
    bankCode: searchParams.get("bankCode") || undefined,
    employeeType: searchParams.get("employeeType") || undefined,
    empCode: searchParams.get("empCode") || undefined,
  };
}

// Sort-by/Group-by + subtotal/grand-total (2026-09-23) — scoped to the
// "flat table" reports only per the user's own decision (Payslip/employee
// card are per-person card layouts, not tables; dept/site-summary are
// matrix reports already grouped by definition). See
// src/lib/reports/group-sort.ts for the underlying engine.
interface SortGroupParams {
  sortBy: SortByField;
  sortDir: SortDir;
  groupBy: GroupByField;
}
function parseSortGroup(searchParams: URLSearchParams): SortGroupParams {
  return { sortBy: parseSortBy(searchParams.get("sortBy")), sortDir: parseSortDir(searchParams.get("sortDir")), groupBy: parseGroupBy(searchParams.get("groupBy")) };
}
function applySortGroup<T extends GroupableRow>(rows: T[], sg: SortGroupParams): { sorted: T[]; groups: RowGroup<T>[] | null } {
  const sorted = sortRows(rows, sg.sortBy, sg.sortDir);
  return { sorted, groups: groupRows(sorted, sg.groupBy) };
}

async function resolveCompanyName(companyCode?: string): Promise<string> {
  const company = companyCode
    ? await prisma.refCompany.findUnique({ where: { CompanyCode: companyCode } })
    : await prisma.refCompany.findFirst({ orderBy: { CompanyCode: "asc" } });
  return company?.CompanyName ?? "";
}

async function resolvePeriodLabel(periodId: number): Promise<string> {
  const p = await prisma.sysPeriod.findUniqueOrThrow({ where: { PeriodID: periodId } });
  return `งวด ${p.PeriodMonth}/${p.PeriodYear + 543} (${p.StartDate.toLocaleDateString("th-TH")} - ${p.EndDate.toLocaleDateString("th-TH")})`;
}

function monthLabel(year: number, month: number): string {
  return `เดือน ${month}/${year + 543}`;
}

function filterSummaryText(filters: ReportFilters, periodLabel?: string) {
  const parts: string[] = [];
  if (periodLabel) parts.push(periodLabel);
  if (filters.deptCode) parts.push(`แผนก: ${filters.deptCode}`);
  if (filters.siteCode) parts.push(`หน่วยงาน: ${filters.siteCode}`);
  if (filters.bankCode) parts.push(`ธนาคาร: ${filters.bankCode}`);
  if (filters.employeeType) parts.push(`ประเภทพนักงาน: ${filters.employeeType}`);
  if (filters.empCode) parts.push(`รหัสพนักงาน: ${filters.empCode}`);
  return parts.join(" · ");
}

// renderToBuffer()/ExcelJS's writeBuffer() both return Node Buffer-ish types
// that TS's DOM-lib BodyInit typing doesn't structurally accept directly —
// Uint8Array is unambiguously BodyInit-compatible and a Buffer already IS a
// Uint8Array at runtime, so this is a type-level normalization only.
function pdfResponse(buffer: Buffer, filename: string) {
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"` },
  });
}
function excelResponse(buffer: Buffer | ArrayBuffer, filename: string) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
    },
  });
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/payroll/reports/[reportKey]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_REPORT", "read");
  if (denied) return denied;

  const { reportKey } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") === "excel" ? "excel" : "pdf";
  const filters = parseFilters(searchParams);
  const sg = parseSortGroup(searchParams);
  const companyName = await resolveCompanyName(filters.companyCode);

  const periodScoped = ["payslip", "bank-remit", "dept-summary", "site-summary", "sso-remit-check", "welfare-fund-remit"].includes(reportKey);
  if (periodScoped && !filters.periodId) {
    return apiError(400, "INVALID_PARAMS", "periodId is required for this report");
  }
  // สปส 1-10 and ภงด.1 are filed MONTHLY even though DAILY payroll can run
  // semi-monthly (2 sys_period rows per calendar month) — see
  // src/lib/reports/government-reports.ts.
  const monthScoped = ["sso-remit", "withholding-tax"].includes(reportKey);
  if (monthScoped && (!filters.year || !filters.month)) {
    return apiError(400, "INVALID_PARAMS", "year and month are required for this report");
  }
  const yearScoped = ["withholding-tax-annual", "tax-certificate-50bis"].includes(reportKey);
  if (yearScoped && !filters.year) {
    return apiError(400, "INVALID_PARAMS", "year is required for this report");
  }

  if (reportKey === "payslip") {
    const rows = await getPayslipRows(filters.periodId!, filters);
    if (format === "pdf") {
      const buffer = await renderToBuffer(<PayslipPdf companyName={companyName} slips={rows} />);
      return pdfResponse(buffer, "payslip");
    }
    const columns: ReportExcelColumn[] = [
      { header: "รหัสพนักงาน", key: "empCode", width: 12 },
      { header: "ชื่อ-สกุล", key: "fullName", width: 26 },
      { header: "แผนก", key: "deptName", width: 16 },
      { header: "หน่วยงาน", key: "siteName", width: 16 },
      { header: "รายได้รวม", key: "totalIncome", width: 14 },
      { header: "รายการหักรวม", key: "totalDeduction", width: 14 },
      { header: "สุทธิ", key: "netPay", width: 14 },
      { header: "ธนาคาร", key: "bankName", width: 16 },
      { header: "เลขบัญชี", key: "bankAccountNo", width: 16 },
    ];
    const excelRows = rows.map((r) => ({
      empCode: r.empCode,
      fullName: r.fullName,
      deptName: r.deptName ?? "",
      siteName: r.siteName ?? "",
      totalIncome: r.totalIncome,
      totalDeduction: r.totalDeduction,
      netPay: r.netPay,
      bankName: r.bankName ?? "",
      bankAccountNo: r.bankAccountNo ?? "",
    }));
    const buffer = await buildReportWorkbook("Payslip", columns, excelRows);
    return excelResponse(buffer, "payslip");
  }

  if (reportKey === "bank-remit") {
    const rowsRaw = await getBankRemittanceRows(filters.periodId!, filters);
    const { sorted, groups } = applySortGroup(rowsRaw, sg);
    const pdfColumns: ReportColumn[] = [
      { key: "bankName", header: "ธนาคาร", width: 3 },
      { key: "empCode", header: "รหัสพนักงาน", width: 2 },
      { key: "fullName", header: "ชื่อ-สกุล", width: 4 },
      { key: "bankAccountNo", header: "เลขบัญชี", width: 3 },
      { key: "netPay", header: "จำนวนเงิน", width: 2, align: "right" },
    ];
    const toPdfRow = (r: (typeof sorted)[number]) => [r.bankName ?? "(ไม่มีข้อมูลธนาคาร)", r.empCode, r.fullName, r.bankAccountNo ?? "-", money(r.netPay)];
    const toSubtotalPdfRow = (label: string, g: typeof sorted) => ["", "", "", `รวม - ${label}`, money(sumField(g, (r) => r.netPay))];
    const { rows: pdfRows, boldRowIndices } = buildGroupedRows(sorted, groups, toPdfRow, toSubtotalPdfRow);
    const grandTotal = sumField(sorted, (r) => r.netPay);
    if (format === "pdf") {
      const buffer = await renderToBuffer(
        <TableReportPdf
          companyName={companyName}
          title="รายงานนำส่งธนาคาร"
          filterSummary={filterSummaryText(filters)}
          columns={pdfColumns}
          rows={pdfRows}
          totalRow={["", "", "", "รวม", money(grandTotal)]}
          boldRowIndices={boldRowIndices}
        />,
      );
      return pdfResponse(buffer, "bank-remittance");
    }
    const columns: ReportExcelColumn[] = [
      { header: "รหัสธนาคาร", key: "bankCode", width: 12 },
      { header: "ธนาคาร", key: "bankName", width: 20 },
      { header: "รหัสพนักงาน", key: "empCode", width: 12 },
      { header: "ชื่อ-สกุล", key: "fullName", width: 26 },
      { header: "เลขบัญชี", key: "bankAccountNo", width: 16 },
      { header: "จำนวนเงิน", key: "netPay", width: 14 },
    ];
    const toExcelRow = (r: (typeof sorted)[number]) => ({ bankCode: r.bankCode ?? "", bankName: r.bankName ?? "", empCode: r.empCode, fullName: r.fullName, bankAccountNo: r.bankAccountNo ?? "", netPay: r.netPay });
    const toSubtotalExcelRow = (label: string, g: typeof sorted) => ({ fullName: `รวม - ${label}`, netPay: sumField(g, (r) => r.netPay).toFixed(2) });
    const { rows: excelRows, boldRowIndices: excelBoldRowIndices } = buildGroupedExcelRows(sorted, groups, toExcelRow, toSubtotalExcelRow);
    const buffer = await buildReportWorkbook("รายงานนำส่งธนาคาร", columns, excelRows, { fullName: "รวม", netPay: grandTotal.toFixed(2) }, excelBoldRowIndices);
    return excelResponse(buffer, "bank-remittance");
  }

  if (reportKey === "dept-summary" || reportKey === "site-summary") {
    const groupBy = reportKey === "dept-summary" ? "DEPT" : "SITE";
    const matrix = await getPaySummaryMatrix(filters.periodId!, filters, groupBy);
    const title = groupBy === "DEPT" ? "สรุปการจ่ายแยกประเภท ตามแผนก" : "สรุปการจ่ายแยกประเภท ตามหน่วยงาน";
    const groupHeader = groupBy === "DEPT" ? "แผนก" : "หน่วยงาน";
    const pdfColumns: ReportColumn[] = [
      { key: "group", header: groupHeader, width: 3 },
      { key: "employeeCount", header: "จำนวนคน", width: 1, align: "right" },
      { key: "totalDays", header: "จำนวน (วัน)", width: 1, align: "right" },
      ...matrix.columns.map((c) => ({ key: `${c.type}:${c.code}`, header: c.label, width: 2, align: "right" as const })),
      { key: "netPay", header: "สุทธิ", width: 2, align: "right" as const },
    ];
    const pdfRows = matrix.rows.map((r) => [r.groupName, r.employeeCount, r.totalDays, ...matrix.columns.map((c) => money(r.amounts[`${c.type}:${c.code}`])), money(r.netPay)]);
    const totalRow = [
      "รวม",
      matrix.grandTotal.employeeCount,
      matrix.grandTotal.totalDays,
      ...matrix.columns.map((c) => money(matrix.grandTotal.amounts[`${c.type}:${c.code}`])),
      money(matrix.grandTotal.netPay),
    ];
    if (format === "pdf") {
      const buffer = await renderToBuffer(
        <TableReportPdf companyName={companyName} title={title} filterSummary={filterSummaryText(filters)} columns={pdfColumns} rows={pdfRows} totalRow={totalRow} orientation="landscape" />,
      );
      return pdfResponse(buffer, reportKey);
    }
    const columns: ReportExcelColumn[] = [
      { header: groupHeader, key: "group", width: 20 },
      { header: "จำนวนคน", key: "employeeCount", width: 10 },
      { header: "จำนวน (วัน)", key: "totalDays", width: 12 },
      ...matrix.columns.map((c) => ({ header: c.label, key: `${c.type}:${c.code}`, width: 14 })),
      { header: "สุทธิ", key: "netPay", width: 14 },
    ];
    const excelRows = matrix.rows.map((r) => ({ group: r.groupName, employeeCount: r.employeeCount, totalDays: r.totalDays, ...r.amounts, netPay: r.netPay }));
    const excelTotal = { group: "รวม", employeeCount: matrix.grandTotal.employeeCount, totalDays: matrix.grandTotal.totalDays, ...matrix.grandTotal.amounts, netPay: matrix.grandTotal.netPay };
    const buffer = await buildReportWorkbook(title, columns, excelRows, excelTotal);
    return excelResponse(buffer, reportKey);
  }

  if (reportKey in DEBT_KEYS) {
    const key = DEBT_KEYS[reportKey];
    const rowsRaw = await getDebtRows(key, filters);
    const { sorted, groups } = applySortGroup(rowsRaw, sg);
    const title = DEBT_REPORT_CATEGORIES[key].label;
    const pdfColumns: ReportColumn[] = [
      { key: "empCode", header: "รหัสพนักงาน", width: 2 },
      { key: "fullName", header: "ชื่อ-สกุล", width: 3 },
      { key: "deptName", header: "แผนก", width: 2 },
      { key: "siteName", header: "หน่วยงาน", width: 2 },
      { key: "documentNo", header: "เลขที่เอกสาร", width: 2 },
      { key: "totalAmount", header: "ยอดรวม", width: 2, align: "right" },
      { key: "paidAmount", header: "ชำระแล้ว", width: 2, align: "right" },
      { key: "remainingAmount", header: "คงเหลือ", width: 2, align: "right" },
    ];
    const toPdfRow = (r: (typeof sorted)[number]) => [r.empCode, r.fullName, r.deptName ?? "-", r.siteName ?? "-", r.documentNo ?? "-", money(r.totalAmount), money(r.paidAmount), money(r.remainingAmount)];
    const toSubtotalPdfRow = (label: string, g: typeof sorted) => [
      "",
      `รวม - ${label}`,
      "",
      "",
      "",
      money(sumField(g, (r) => r.totalAmount)),
      money(sumField(g, (r) => r.paidAmount)),
      money(sumField(g, (r) => r.remainingAmount)),
    ];
    const { rows: pdfRows, boldRowIndices } = buildGroupedRows(sorted, groups, toPdfRow, toSubtotalPdfRow);
    const grandRemaining = sumField(sorted, (r) => r.remainingAmount);
    if (format === "pdf") {
      const buffer = await renderToBuffer(
        <TableReportPdf
          companyName={companyName}
          title={title}
          filterSummary={filterSummaryText(filters)}
          columns={pdfColumns}
          rows={pdfRows}
          totalRow={["", "", "", "", "รวม", money(sumField(sorted, (r) => r.totalAmount)), money(sumField(sorted, (r) => r.paidAmount)), money(grandRemaining)]}
          orientation="landscape"
          boldRowIndices={boldRowIndices}
        />,
      );
      return pdfResponse(buffer, reportKey);
    }
    const columns: ReportExcelColumn[] = [
      { header: "รหัสพนักงาน", key: "empCode", width: 12 },
      { header: "ชื่อ-สกุล", key: "fullName", width: 26 },
      { header: "แผนก", key: "deptName", width: 16 },
      { header: "หน่วยงาน", key: "siteName", width: 16 },
      { header: "รายการ", key: "deductionName", width: 20 },
      { header: "เลขที่เอกสาร", key: "documentNo", width: 14 },
      { header: "ยอดรวม", key: "totalAmount", width: 12 },
      { header: "ชำระแล้ว", key: "paidAmount", width: 12 },
      { header: "คงเหลือ", key: "remainingAmount", width: 12 },
      { header: "หักงวดละ", key: "deductPerPeriod", width: 12 },
    ];
    const toExcelRow = (r: (typeof sorted)[number]) => ({ ...r, deptName: r.deptName ?? "", siteName: r.siteName ?? "", documentNo: r.documentNo ?? "", deductPerPeriod: r.deductPerPeriod ?? "" });
    const toSubtotalExcelRow = (label: string, g: typeof sorted) => ({
      fullName: `รวม - ${label}`,
      totalAmount: sumField(g, (r) => r.totalAmount).toFixed(2),
      paidAmount: sumField(g, (r) => r.paidAmount).toFixed(2),
      remainingAmount: sumField(g, (r) => r.remainingAmount).toFixed(2),
    });
    const { rows: excelRows, boldRowIndices: excelBoldRowIndices } = buildGroupedExcelRows(sorted, groups, toExcelRow, toSubtotalExcelRow);
    const buffer = await buildReportWorkbook(
      title,
      columns,
      excelRows,
      { fullName: "รวม", totalAmount: sumField(sorted, (r) => r.totalAmount).toFixed(2), paidAmount: sumField(sorted, (r) => r.paidAmount).toFixed(2), remainingAmount: grandRemaining.toFixed(2) },
      excelBoldRowIndices,
    );
    return excelResponse(buffer, reportKey);
  }

  if (reportKey === "employee-registry") {
    // Column set matches the user's legacy "รายงานทะเบียนพนักงาน" export
    // exactly (2026-09-23) — ลำดับ/รหัสพนักงาน/เลขบัตรประชาชน/คำนำหน้า/ชื่อ/
    // นามสกุล/วันเกิด/เริ่มงาน/อายุ/สิ้นสุดการจ้าง/สถานะ/ที่อยู่ปัจจุบัน/เพศ/
    // สัญชาติ/หน่วยงาน/สิทธิรักษา. No filter on EmployeeStatus — the legacy
    // export includes resigned employees too (335 pages of them), so this
    // intentionally lists everyone matching the other filters regardless of
    // status, same as getEmployeeRegistryRows() always did.
    const rowsRaw = await getEmployeeRegistryRows(filters);
    const { sorted, groups } = applySortGroup(rowsRaw, sg);
    const pdfColumns: ReportColumn[] = [
      { key: "no", header: "ลำดับ", width: 1, align: "right" },
      { key: "empCode", header: "รหัสพนักงาน", width: 2 },
      { key: "idCardNo", header: "เลขบัตรประชาชน", width: 2 },
      { key: "title", header: "คำนำหน้า", width: 1 },
      { key: "firstName", header: "ชื่อ", width: 2 },
      { key: "lastName", header: "นามสกุล", width: 2 },
      { key: "birthDate", header: "วันเกิด", width: 2 },
      { key: "startDate", header: "เริ่มงาน", width: 2 },
      { key: "age", header: "อายุ", width: 1, align: "right" },
      { key: "resignDate", header: "สิ้นสุดการจ้าง", width: 2 },
      { key: "status", header: "สถานะ", width: 1 },
      { key: "gender", header: "เพศ", width: 1 },
      { key: "nationality", header: "สัญชาติ", width: 1 },
      { key: "siteName", header: "หน่วยงาน", width: 2 },
      { key: "ssoHospitalName", header: "สิทธิรักษา", width: 2 },
    ];
    let pdfRowNo = 0;
    const toPdfRow = (r: (typeof sorted)[number]) => {
      pdfRowNo += 1;
      return [
        pdfRowNo,
        r.empCode,
        r.idCardNo,
        r.title ?? "-",
        r.firstName ?? "-",
        r.lastName ?? "-",
        r.birthDate ?? "-",
        r.startDate,
        r.age ?? "-",
        r.resignDate ?? "-",
        r.status,
        r.gender ?? "-",
        r.nationality ?? "-",
        r.siteName ?? "-",
        r.ssoHospitalName ?? "-",
      ];
    };
    // No numeric money column on this report — a group's "subtotal" and the
    // grand total are both just a headcount.
    const toSubtotalPdfRow = (label: string, g: typeof sorted) => ["", `รวม - ${label}`, `${g.length} คน`, "", "", "", "", "", "", "", "", "", "", "", ""];
    const { rows: pdfRows, boldRowIndices } = buildGroupedRows(sorted, groups, toPdfRow, toSubtotalPdfRow);
    if (format === "pdf") {
      const buffer = await renderToBuffer(
        <TableReportPdf
          companyName={companyName}
          title="ทะเบียนพนักงาน"
          filterSummary={filterSummaryText(filters)}
          columns={pdfColumns}
          rows={pdfRows}
          totalRow={["", "รวม", `${sorted.length} คน`, "", "", "", "", "", "", "", "", "", "", "", ""]}
          orientation="landscape"
          boldRowIndices={boldRowIndices}
        />,
      );
      return pdfResponse(buffer, "employee-registry");
    }
    const columns: ReportExcelColumn[] = [
      { header: "ลำดับ", key: "no", width: 8 },
      { header: "รหัสพนักงาน", key: "empCode", width: 12 },
      { header: "เลขบัตรประชาชน", key: "idCardNo", width: 18 },
      { header: "คำนำหน้า", key: "title", width: 10 },
      { header: "ชื่อ", key: "firstName", width: 16 },
      { header: "นามสกุล", key: "lastName", width: 16 },
      { header: "วันเกิด", key: "birthDate", width: 12 },
      { header: "เริ่มงาน", key: "startDate", width: 12 },
      { header: "อายุ", key: "age", width: 8 },
      { header: "สิ้นสุดการจ้าง", key: "resignDate", width: 14 },
      { header: "สถานะ", key: "status", width: 10 },
      { header: "ที่อยู่ปัจจุบัน", key: "address", width: 30 },
      { header: "เพศ", key: "gender", width: 10 },
      { header: "สัญชาติ", key: "nationality", width: 10 },
      { header: "หน่วยงาน", key: "siteName", width: 20 },
      { header: "สิทธิรักษา", key: "ssoHospitalName", width: 20 },
    ];
    let excelRowNo = 0;
    const toExcelRow = (r: (typeof sorted)[number]) => {
      excelRowNo += 1;
      return {
        no: excelRowNo,
        empCode: r.empCode,
        idCardNo: r.idCardNo,
        title: r.title ?? "",
        firstName: r.firstName ?? "",
        lastName: r.lastName ?? "",
        birthDate: r.birthDate ?? "",
        startDate: r.startDate,
        age: r.age ?? "",
        resignDate: r.resignDate ?? "",
        status: r.status,
        address: r.address ?? "",
        gender: r.gender ?? "",
        nationality: r.nationality ?? "",
        siteName: r.siteName ?? "",
        ssoHospitalName: r.ssoHospitalName ?? "",
      };
    };
    const toSubtotalExcelRow = (label: string, g: typeof sorted) => ({ empCode: `รวม - ${label}`, idCardNo: `${g.length} คน` });
    const { rows: excelRows, boldRowIndices: excelBoldRowIndices } = buildGroupedExcelRows(sorted, groups, toExcelRow, toSubtotalExcelRow);
    const buffer = await buildReportWorkbook("ทะเบียนพนักงาน", columns, excelRows, { empCode: "รวม", idCardNo: `${sorted.length} คน` }, excelBoldRowIndices);
    return excelResponse(buffer, "employee-registry");
  }

  if (reportKey === "employee-card") {
    const sectionsRaw = searchParams.get("sections");
    const sections = new Set<EmployeeCardSection>(
      sectionsRaw
        ? (sectionsRaw.split(",").filter((s): s is EmployeeCardSection => (EMPLOYEE_CARD_SECTIONS as readonly string[]).includes(s)) as EmployeeCardSection[])
        : EMPLOYEE_CARD_SECTIONS,
    );
    const leaveYearRaw = searchParams.get("leaveYear");
    const leaveYear = sections.has("LEAVE_HISTORY") && leaveYearRaw ? Number(leaveYearRaw) : undefined;
    const cards = await getEmployeeCards(filters, leaveYear);
    if (format === "pdf") {
      const buffer = await renderToBuffer(<EmployeeCardPdf companyName={companyName} cards={cards} sections={sections} />);
      return pdfResponse(buffer, "employee-card");
    }
    const columns: ReportExcelColumn[] = [
      { header: "รหัสพนักงาน", key: "empCode", width: 12 },
      { header: "ชื่อ-สกุล", key: "fullName", width: 26 },
      ...(sections.has("EMPLOYEE_INFO")
        ? ([
            { header: "แผนก", key: "deptName", width: 16 },
            { header: "ตำแหน่ง", key: "positionName", width: 16 },
            { header: "หน่วยงาน", key: "siteName", width: 16 },
            { header: "ประเภทพนักงาน", key: "employeeType", width: 14 },
            { header: "วันเริ่มงาน", key: "startDate", width: 12 },
            { header: "สถานะ", key: "status", width: 10 },
            { header: "เลขที่ใบอนุญาต ธภ.6", key: "licenseNo6", width: 16 },
            { header: "เลขที่ใบอนุญาต ธภ.7", key: "licenseNo7", width: 16 },
          ] satisfies ReportExcelColumn[])
        : []),
      ...(sections.has("PERSONAL_INFO")
        ? ([
            { header: "เลขบัตรประชาชน", key: "idCardNo", width: 18 },
            { header: "วันเกิด", key: "birthDate", width: 12 },
            { header: "เบอร์โทร", key: "phoneNo", width: 14 },
            { header: "ที่อยู่", key: "address", width: 30 },
          ] satisfies ReportExcelColumn[])
        : []),
      ...(sections.has("TBOR7") ? ([{ header: "ธภ.7 ผ่านครบหรือไม่", key: "tbor7Complete", width: 16 }] satisfies ReportExcelColumn[]) : []),
    ];
    const buffer = await buildReportWorkbook(
      "การ์ดพนักงาน",
      columns,
      cards.map((c) => ({
        empCode: c.empCode,
        fullName: c.fullName,
        deptName: c.deptName ?? "",
        positionName: c.positionName ?? "",
        siteName: c.siteName ?? "",
        employeeType: c.employeeType,
        startDate: c.startDate,
        status: c.status,
        licenseNo6: c.licenseNo6 ?? "",
        licenseNo7: c.licenseNo7 ?? "",
        idCardNo: c.idCardNo,
        birthDate: c.birthDate ?? "",
        phoneNo: c.phoneNo ?? "",
        address: c.address ?? "",
        tbor7Complete: c.tbor7Topics.every(Boolean) ? "ครบ" : "ไม่ครบ",
      })),
    );
    return excelResponse(buffer, "employee-card");
  }

  if (reportKey === "sso-remit" || reportKey === "sso-remit-check" || reportKey === "welfare-fund-remit") {
    const rowsRaw =
      reportKey === "sso-remit"
        ? await getSsoRemitMonthlyRows(filters.year!, filters.month!, filters)
        : reportKey === "sso-remit-check"
          ? await getSsoRemitCheckRows(filters.periodId!, filters)
          : await getWelfareFundRemitRows(filters.periodId!, filters);
    const { sorted, groups } = applySortGroup(rowsRaw, sg);
    const title = reportKey === "sso-remit" ? "รายงาน สปส 1-10" : reportKey === "sso-remit-check" ? "รายงาน สปส 1-10 (ตรวจสอบ)" : "รายงาน สรุปยอดสงเคราะห์พนักงาน";
    const employeeLabel = reportKey === "welfare-fund-remit" ? "เงินสมทบ (ลูกจ้าง)" : "เงินสมทบ (ผู้ประกันตน)";
    const scopeLabel = reportKey === "sso-remit" ? monthLabel(filters.year!, filters.month!) : await resolvePeriodLabel(filters.periodId!);
    const pdfColumns: ReportColumn[] = [
      { key: "empCode", header: "รหัสพนักงาน", width: 2 },
      { key: "idCardNo", header: "เลขบัตรประชาชน", width: 3 },
      { key: "fullName", header: "ชื่อ-สกุล", width: 4 },
      { key: "wageBase", header: "ค่าจ้าง", width: 2, align: "right" },
      { key: "employeeAmount", header: employeeLabel, width: 2, align: "right" },
      { key: "employerAmount", header: "เงินสมทบ (นายจ้าง)", width: 2, align: "right" },
      { key: "totalAmount", header: "รวม", width: 2, align: "right" },
    ];
    const toPdfRow = (r: (typeof sorted)[number]) => [
      r.empCode,
      r.idCardNo,
      r.fullName,
      money(r.wageBase),
      money(r.employeeAmount),
      r.employerAmount ? money(r.employerAmount) : "-",
      r.totalAmount ? money(r.totalAmount) : "-",
    ];
    const toSubtotalPdfRow = (label: string, g: typeof sorted) => {
      const hasEmployer = g.some((r) => r.employerAmount !== null);
      return [
        "",
        "",
        `รวม - ${label}`,
        "",
        money(sumField(g, (r) => r.employeeAmount)),
        hasEmployer ? money(sumField(g, (r) => r.employerAmount)) : "-",
        hasEmployer ? money(sumField(g, (r) => r.totalAmount)) : "-",
      ];
    };
    const { rows: pdfRows, boldRowIndices } = buildGroupedRows(sorted, groups, toPdfRow, toSubtotalPdfRow);
    const grandEmployee = sumField(sorted, (r) => r.employeeAmount);
    const grandEmployer = sumField(sorted, (r) => r.employerAmount);
    const grandTotal = sumField(sorted, (r) => r.totalAmount);
    if (format === "pdf") {
      const buffer = await renderToBuffer(
        <TableReportPdf
          companyName={companyName}
          title={title}
          filterSummary={filterSummaryText(filters, scopeLabel)}
          columns={pdfColumns}
          rows={pdfRows}
          totalRow={["", "", "รวม", "", money(grandEmployee), money(grandEmployer), money(grandTotal)]}
          orientation="landscape"
          boldRowIndices={boldRowIndices}
        />,
      );
      return pdfResponse(buffer, reportKey);
    }
    const columns: ReportExcelColumn[] = [
      { header: "รหัสพนักงาน", key: "empCode", width: 12 },
      { header: "เลขบัตรประชาชน", key: "idCardNo", width: 18 },
      { header: "ชื่อ-สกุล", key: "fullName", width: 26 },
      { header: "ค่าจ้าง", key: "wageBase", width: 14 },
      { header: employeeLabel, key: "employeeAmount", width: 16 },
      { header: "เงินสมทบ (นายจ้าง)", key: "employerAmount", width: 16 },
      { header: "รวม", key: "totalAmount", width: 14 },
    ];
    const toExcelRow = (r: (typeof sorted)[number]) => ({ ...r, employerAmount: r.employerAmount ?? "", totalAmount: r.totalAmount ?? "" });
    const toSubtotalExcelRow = (label: string, g: typeof sorted) => {
      const hasEmployer = g.some((r) => r.employerAmount !== null);
      return {
        fullName: `รวม - ${label}`,
        employeeAmount: sumField(g, (r) => r.employeeAmount).toFixed(2),
        employerAmount: hasEmployer ? sumField(g, (r) => r.employerAmount).toFixed(2) : "",
        totalAmount: hasEmployer ? sumField(g, (r) => r.totalAmount).toFixed(2) : "",
      };
    };
    const { rows: excelRows, boldRowIndices: excelBoldRowIndices } = buildGroupedExcelRows(sorted, groups, toExcelRow, toSubtotalExcelRow);
    const buffer = await buildReportWorkbook(
      title,
      columns,
      excelRows,
      { fullName: "รวม", employeeAmount: grandEmployee.toFixed(2), employerAmount: grandEmployer.toFixed(2), totalAmount: grandTotal.toFixed(2) },
      excelBoldRowIndices,
    );
    return excelResponse(buffer, reportKey);
  }

  if (reportKey === "withholding-tax") {
    const rowsRaw = await getWithholdingTaxRows(filters.year!, filters.month!, filters);
    const { sorted, groups } = applySortGroup(rowsRaw, sg);
    const scopeLabel = monthLabel(filters.year!, filters.month!);
    const pdfColumns: ReportColumn[] = [
      { key: "empCode", header: "รหัสพนักงาน", width: 2 },
      { key: "idCardNo", header: "เลขบัตรประชาชน", width: 3 },
      { key: "fullName", header: "ชื่อ-สกุล", width: 4 },
      { key: "income", header: "เงินได้", width: 2, align: "right" },
      { key: "taxWithheld", header: "ภาษีที่หักไว้", width: 2, align: "right" },
    ];
    const toPdfRow = (r: (typeof sorted)[number]) => [r.empCode, r.idCardNo, r.fullName, money(r.income), money(r.taxWithheld)];
    const toSubtotalPdfRow = (label: string, g: typeof sorted) => ["", "", `รวม - ${label}`, money(sumField(g, (r) => r.income)), money(sumField(g, (r) => r.taxWithheld))];
    const { rows: pdfRows, boldRowIndices } = buildGroupedRows(sorted, groups, toPdfRow, toSubtotalPdfRow);
    const grandIncome = sumField(sorted, (r) => r.income);
    const grandTax = sumField(sorted, (r) => r.taxWithheld);
    if (format === "pdf") {
      const buffer = await renderToBuffer(
        <TableReportPdf
          companyName={companyName}
          title="รายงาน ภงด.1"
          filterSummary={filterSummaryText(filters, scopeLabel)}
          columns={pdfColumns}
          rows={pdfRows}
          totalRow={["", "", "รวม", money(grandIncome), money(grandTax)]}
          boldRowIndices={boldRowIndices}
        />,
      );
      return pdfResponse(buffer, reportKey);
    }
    const columns: ReportExcelColumn[] = [
      { header: "รหัสพนักงาน", key: "empCode", width: 12 },
      { header: "เลขบัตรประชาชน", key: "idCardNo", width: 18 },
      { header: "ชื่อ-สกุล", key: "fullName", width: 26 },
      { header: "เงินได้", key: "income", width: 14 },
      { header: "ภาษีที่หักไว้", key: "taxWithheld", width: 14 },
    ];
    const toExcelRow = (r: (typeof sorted)[number]) => ({ ...r });
    const toSubtotalExcelRow = (label: string, g: typeof sorted) => ({ fullName: `รวม - ${label}`, income: sumField(g, (r) => r.income).toFixed(2), taxWithheld: sumField(g, (r) => r.taxWithheld).toFixed(2) });
    const { rows: excelRows, boldRowIndices: excelBoldRowIndices } = buildGroupedExcelRows(sorted, groups, toExcelRow, toSubtotalExcelRow);
    const buffer = await buildReportWorkbook("รายงาน ภงด.1", columns, excelRows, { fullName: "รวม", income: grandIncome.toFixed(2), taxWithheld: grandTax.toFixed(2) }, excelBoldRowIndices);
    return excelResponse(buffer, reportKey);
  }

  if (reportKey === "withholding-tax-annual" || reportKey === "tax-certificate-50bis") {
    // Both actual government forms (ภ.ง.ด.1ก และ 50ทวิ) carry the same
    // columns — ลำดับที่/เลขประจำตัวผู้เสียภาษี/ชื่อ+ที่อยู่ผู้มีเงินได้/
    // เงินได้ที่จ่ายทั้งปี/ภาษีที่หักและนำส่งทั้งปี — confirmed against the
    // actual form images the user sent 2026-09-23. Same underlying annual
    // aggregation either way; only the title differs.
    const isCertificate = reportKey === "tax-certificate-50bis";
    const rowsRaw = await getAnnualTaxSummaryRows(filters.year!, filters);
    const { sorted, groups } = applySortGroup(rowsRaw, sg);
    const title = isCertificate ? "หนังสือรับรองการหักภาษี ณ ที่จ่าย (50ทวิ)" : "รายงาน ภงด.1 ก";
    const yearLabel = `ปีภาษี พ.ศ. ${filters.year! + 543}`;
    const pdfColumns: ReportColumn[] = [
      { key: "empCode", header: "รหัสพนักงาน", width: 2 },
      { key: "idCardNo", header: "เลขบัตรประชาชน", width: 3 },
      { key: "fullName", header: "ชื่อ-สกุล", width: 3 },
      { key: "address", header: "ที่อยู่", width: 4 },
      { key: "totalIncome", header: "เงินได้รวมทั้งปี", width: 2, align: "right" },
      { key: "totalTaxWithheld", header: "ภาษีที่หักไว้ทั้งปี", width: 2, align: "right" },
    ];
    const toPdfRow = (r: (typeof sorted)[number]) => [r.empCode, r.idCardNo, r.fullName, r.address ?? "-", money(r.totalIncome), money(r.totalTaxWithheld)];
    const toSubtotalPdfRow = (label: string, g: typeof sorted) => ["", "", `รวม - ${label}`, "", money(sumField(g, (r) => r.totalIncome)), money(sumField(g, (r) => r.totalTaxWithheld))];
    const { rows: pdfRows, boldRowIndices } = buildGroupedRows(sorted, groups, toPdfRow, toSubtotalPdfRow);
    const grandIncome = sumField(sorted, (r) => r.totalIncome);
    const grandTax = sumField(sorted, (r) => r.totalTaxWithheld);
    const totalRow = ["", "", "รวม", "", money(grandIncome), money(grandTax)];
    if (format === "pdf") {
      const buffer = await renderToBuffer(
        <TableReportPdf
          companyName={companyName}
          title={title}
          filterSummary={filterSummaryText(filters, yearLabel)}
          columns={pdfColumns}
          rows={pdfRows}
          totalRow={totalRow}
          orientation="landscape"
          boldRowIndices={boldRowIndices}
        />,
      );
      return pdfResponse(buffer, reportKey);
    }
    const columns: ReportExcelColumn[] = [
      { header: "รหัสพนักงาน", key: "empCode", width: 12 },
      { header: "เลขบัตรประชาชน", key: "idCardNo", width: 18 },
      { header: "ชื่อ-สกุล", key: "fullName", width: 26 },
      { header: "ที่อยู่", key: "address", width: 30 },
      { header: "เงินได้รวมทั้งปี", key: "totalIncome", width: 16 },
      { header: "ภาษีที่หักไว้ทั้งปี", key: "totalTaxWithheld", width: 16 },
    ];
    const toExcelRow = (r: (typeof sorted)[number]) => ({ ...r, address: r.address ?? "" });
    const toSubtotalExcelRow = (label: string, g: typeof sorted) => ({
      fullName: `รวม - ${label}`,
      totalIncome: sumField(g, (r) => r.totalIncome).toFixed(2),
      totalTaxWithheld: sumField(g, (r) => r.totalTaxWithheld).toFixed(2),
    });
    const { rows: excelRows, boldRowIndices: excelBoldRowIndices } = buildGroupedExcelRows(sorted, groups, toExcelRow, toSubtotalExcelRow);
    const buffer = await buildReportWorkbook(
      title,
      columns,
      excelRows,
      { fullName: "รวม", totalIncome: grandIncome.toFixed(2), totalTaxWithheld: grandTax.toFixed(2) },
      excelBoldRowIndices,
    );
    return excelResponse(buffer, reportKey);
  }

  return apiError(404, "REPORT_NOT_FOUND", "Unknown reportKey", { reportKey });
}
