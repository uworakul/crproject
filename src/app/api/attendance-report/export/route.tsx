import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { apiError } from "@/lib/api-response";
import { readableSiteScope, getAttendanceRows } from "@/lib/attendance-report";
import type { ReportColumn } from "@/lib/pdf/layout";
import TableReportPdf from "@/lib/reports/pdf/table-report-pdf";
import { buildReportWorkbook, type ReportExcelColumn } from "@/lib/reports/excel-builder";

// รายงานการลงเวลางาน export (2026-10-08) — Role EMPLOYEE is refused; everyone
// else gets exactly the rows the on-screen report would show for the same
// filters (same site scope + employee scope).
const isDay = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const fmtDate = (d: Date) => d.toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });
const fmtTime = (d: Date) => d.toLocaleTimeString("th-TH", { hour12: false, timeZone: "Asia/Bangkok" });

export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  if (user.role === "EMPLOYEE") return apiError(403, "FORBIDDEN", "Role EMPLOYEE cannot export");
  const scope = await readableSiteScope(user);
  if (!scope) return apiError(403, "FORBIDDEN");

  const sp = request.nextUrl.searchParams;
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const from = isDay(sp.get("from")) ? sp.get("from")! : today;
  const to = isDay(sp.get("to")) ? sp.get("to")! : today;
  const siteCode = sp.get("site") || undefined;
  const empCode = sp.get("emp")?.trim() || undefined;
  const format = sp.get("format") === "excel" ? "excel" : "pdf";

  const rows = await getAttendanceRows(user, scope, { siteCode, from, to, empCode });
  const data = rows.map((r, i) => ({
    no: i + 1,
    empCode: r.EmpCode,
    name: r.Employee.FullName,
    site: r.Site.SiteName,
    inDate: fmtDate(r.CheckInTime),
    inTime: fmtTime(r.CheckInTime),
    outDate: r.CheckOutTime ? fmtDate(r.CheckOutTime) : "-",
    outTime: r.CheckOutTime ? fmtTime(r.CheckOutTime) : "-",
  }));
  const cols = [
    { key: "no", header: "ลำดับที่", w: 1 },
    { key: "empCode", header: "รหัสพนักงาน", w: 1.4 },
    { key: "name", header: "ชื่อ", w: 3 },
    { key: "site", header: "หน่วยงาน", w: 3 },
    { key: "inDate", header: "วันที่เข้างาน", w: 1.8 },
    { key: "inTime", header: "เวลาเข้างาน", w: 1.4 },
    { key: "outDate", header: "วันที่ออกงาน", w: 1.8 },
    { key: "outTime", header: "เวลาออกงาน", w: 1.4 },
  ];
  const title = "รายงานการลงเวลางาน";

  if (format === "excel") {
    const columns: ReportExcelColumn[] = cols.map((c) => ({ header: c.header, key: c.key, width: Math.round(c.w * 10) }));
    const buffer = await buildReportWorkbook(title, columns, data);
    return new Response(new Uint8Array(buffer as ArrayBuffer), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="attendance-report.xlsx"` },
    });
  }

  const company = await prisma.refCompany.findFirst({ orderBy: { CompanyCode: "asc" } });
  const pdfColumns: ReportColumn[] = cols.map((c) => ({ key: c.key, header: c.header, width: c.w, align: "left" }));
  const pdfRows = data.map((d) => cols.map((c) => d[c.key as keyof typeof d]));
  const filterSummary = `วันที่ ${from} ถึง ${to}${siteCode ? ` | หน่วยงาน ${siteCode}` : ""}${empCode ? ` | พนักงาน ${empCode}` : ""}`;
  const buffer = await renderToBuffer(
    <TableReportPdf companyName={company?.CompanyName ?? ""} title={title} filterSummary={filterSummary} columns={pdfColumns} rows={pdfRows} orientation="landscape" />,
  );
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="attendance-report.pdf"` },
  });
}
