import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "../../../generated/prisma/client";
import { GENDER_LABELS, type Gender } from "@/lib/validation";
import { employeeWhere, type ReportFilters } from "./types";

// Dashboard (2026-09-23) — three metrics named directly by the user
// (อายุพนักงาน / จำนวนคนในหน่วยงาน / ค่าใช้จ่ายรวมตามหน่วยงาน). Each returns
// the same flat {label, value}[] shape so one set of chart components
// (table/pie/bar/line) can render any of them without knowing which metric
// it is — the metric only decides the data and the unit label.
export interface ChartDatum {
  label: string;
  value: number;
}
export interface DashboardResult {
  data: ChartDatum[];
  unit: string;
}

export function calculateAge(birthDate: Date, asOf: Date = new Date()): number {
  let age = asOf.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear = asOf.getMonth() > birthDate.getMonth() || (asOf.getMonth() === birthDate.getMonth() && asOf.getDate() >= birthDate.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

// Ordered buckets (not a categorical breakdown — a histogram over one
// continuous variable), so charts render this with a single sequential hue
// rather than per-bucket categorical colors, except in pie mode where each
// slice still needs its own hue to be legible at all.
export const AGE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "< 20 ปี", min: 0, max: 19 },
  { label: "20-29 ปี", min: 20, max: 29 },
  { label: "30-39 ปี", min: 30, max: 39 },
  { label: "40-49 ปี", min: 40, max: 49 },
  { label: "50-59 ปี", min: 50, max: 59 },
  { label: "60 ปีขึ้นไป", min: 60, max: 999 },
];

export const INVALID_AGE_LABEL = "ข้อมูลวันเกิดไม่ถูกต้อง";

export async function getAgeDistribution(filters: ReportFilters): Promise<DashboardResult> {
  const employees = await prisma.mstEmployee.findMany({
    where: { ...employeeWhere(filters), BirthDate: { not: null } },
    select: { BirthDate: true },
  });
  const counts = AGE_BUCKETS.map(() => 0);
  let invalid = 0;
  for (const e of employees) {
    const age = calculateAge(e.BirthDate!);
    const idx = AGE_BUCKETS.findIndex((b) => age >= b.min && age <= b.max);
    // A negative or implausibly large age means BirthDate is corrupt (e.g.
    // a Buddhist-era year typed straight into the Gregorian date input,
    // like "2511-10-16" instead of "1968-10-16" — 543 years off, and the
    // resulting age comes out around -485). Rather than silently dropping
    // these rows (which used to make the whole chart read "0 employees"
    // even though headcount was fine), surface them as their own bucket so
    // a bad chart points straight at the employee records to go fix.
    if (idx >= 0) counts[idx] += 1;
    else invalid += 1;
  }
  const data = AGE_BUCKETS.map((b, i) => ({ label: b.label, value: counts[i] }));
  if (invalid > 0) data.push({ label: INVALID_AGE_LABEL, value: invalid });
  return { data, unit: "คน" };
}

// "สถิติการลา ประจำปี แยกประเภทลา" (2026-09-24) — total leave DAYS (not
// request count — matches what every leave-balance screen already reports
// as "used", see getLeaveBalanceSummary) per mst_leave_type, for APPROVED
// requests whose StartDate falls in the given Gregorian year. Every leave
// type is included even at 0 (same reasoning as AGE_BUCKETS above — a
// complete category list makes an empty result legible instead of just
// disappearing that type from the chart). `year` is required, like
// periodId is for cost-by-site — there's no sensible "all years" total.
export async function getLeaveStatsByType(year: number, filters: ReportFilters): Promise<DashboardResult> {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const [leaveTypes, requests] = await Promise.all([
    prisma.mstLeaveType.findMany({ orderBy: { LeaveTypeCode: "asc" }, select: { LeaveTypeCode: true, LeaveTypeName: true } }),
    prisma.trnLeaveRequest.findMany({
      where: { Status: "APPROVED", StartDate: { gte: yearStart, lt: yearEnd }, Employee: employeeWhere(filters) },
      select: { LeaveTypeCode: true, TotalDays: true },
    }),
  ]);
  const totalsByType = new Map<string, Prisma.Decimal>();
  for (const r of requests) {
    totalsByType.set(r.LeaveTypeCode, (totalsByType.get(r.LeaveTypeCode) ?? new Prisma.Decimal(0)).add(r.TotalDays));
  }
  const data = leaveTypes
    .map((t) => ({ label: t.LeaveTypeName, value: Number((totalsByType.get(t.LeaveTypeCode) ?? new Prisma.Decimal(0)).toFixed(2)) }))
    .sort((a, b) => b.value - a.value);
  return { data, unit: "วัน" };
}

export async function getHeadcountBySite(filters: ReportFilters): Promise<DashboardResult> {
  const employees = await prisma.mstEmployee.findMany({ where: employeeWhere(filters), include: { Site: true } });
  const map = new Map<string, number>();
  for (const e of employees) {
    const label = e.Site?.SiteName ?? "(ไม่ระบุหน่วยงาน)";
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  const data = [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  return { data, unit: "คน" };
}

// "ค่าใช้จ่ายรวมตามหน่วยงาน %เทียบทั้งหมด" — grouped by Employee.Site (the
// employee's own DefaultSiteCode), not trn_payroll_transaction.SiteCode —
// same fix already applied to the Payslip/site-summary reports this
// session (that field is just "whichever site's worksheet touched this
// transaction last", wrong for anyone who worked more than one site that
// period). "ค่าใช้จ่าย" = NetPay summed per site, matching what
// "สรุปการจ่ายแยกประเภท ตามหน่วยงาน" already calls "สุทธิ" for a site — one
// definition of site cost across the app, not a second one invented here.
export async function getCostBySite(periodId: number, filters: ReportFilters): Promise<DashboardResult> {
  const transactions = await prisma.trnPayrollTransaction.findMany({
    where: { PeriodID: periodId, Employee: employeeWhere(filters) },
    include: { Employee: { include: { Site: true } } },
  });
  const map = new Map<string, number>();
  for (const t of transactions) {
    const label = t.Employee.Site?.SiteName ?? "(ไม่ระบุหน่วยงาน)";
    map.set(label, (map.get(label) ?? 0) + Number(t.NetPay));
  }
  const raw = [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const total = raw.reduce((s, r) => s + r.value, 0);
  const data = raw.map((r) => ({ label: r.label, value: total > 0 ? Math.round((r.value / total) * 1000) / 10 : 0 }));
  return { data, unit: "%" };
}

// --- Stock/welfare value trends (2026-09-24) --------------------------
//
// Neither metric has a historical-cost source to draw on — inv_product.
// UnitCost is a single "current" weighted-average figure, recomputed on
// every Purchase approval, with no snapshot kept per period. Confirmed
// with the user: both trends below are therefore an ESTIMATE (today's
// UnitCost applied retroactively to each past month's quantity), not the
// true cost at the time — the unit string says so explicitly so the
// number is never mistaken for an audited figure.
const ESTIMATE_UNIT = "บาท (ประมาณการ ใช้ต้นทุนปัจจุบัน)";
const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function buildTrailingMonths(count: number): { label: string; start: Date; end: Date }[] {
  const now = new Date();
  const months: { label: string; start: Date; end: Date }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    months.push({ label: `${THAI_MONTHS_SHORT[start.getUTCMonth()]} ${start.getUTCFullYear() + 543}`, start, end });
  }
  return months;
}

// "มูลค่าสต๊อกสินค้า รายเดือน" — running balance at each month-end (not
// that month's movement volume, per the user's choice), company-wide.
// TRANSFER lines are excluded entirely (nets to zero company-wide, same
// reasoning as getTotalStockBalance() in src/lib/inventory.ts — this file
// intentionally doesn't import that one since it needs a per-month running
// ledger, not a single as-of-today balance).
export async function getStockValueByMonth(months = 6): Promise<DashboardResult> {
  const monthDefs = buildTrailingMonths(months);
  const [details, products] = await Promise.all([
    prisma.invStockMovementDetail.findMany({
      where: { Movement: { Status: "CONFIRMED", MovementType: { not: "TRANSFER" } } },
      select: { ProductCode: true, Qty: true, Movement: { select: { MovementType: true, MovementDate: true } } },
      orderBy: { Movement: { MovementDate: "asc" } },
    }),
    prisma.invProduct.findMany({ select: { ProductCode: true, UnitCost: true } }),
  ]);
  const unitCost = new Map(products.map((p) => [p.ProductCode, p.UnitCost]));

  const runningQty = new Map<string, Prisma.Decimal>();
  let cursor = 0;
  const data: ChartDatum[] = monthDefs.map((m) => {
    while (cursor < details.length && details[cursor].Movement.MovementDate <= m.end) {
      const d = details[cursor];
      const delta = d.Movement.MovementType === "ISSUE" ? d.Qty.neg() : d.Qty; // PURCHASE/ADJUST/RETURN add (Qty already signed for ADJUST corrections)
      runningQty.set(d.ProductCode, (runningQty.get(d.ProductCode) ?? new Prisma.Decimal(0)).add(delta));
      cursor += 1;
    }
    let value = new Prisma.Decimal(0);
    for (const [code, qty] of runningQty) value = value.add(qty.mul(unitCost.get(code) ?? 0));
    return { label: m.label, value: Number(value.toFixed(2)) };
  });
  return { data, unit: ESTIMATE_UNIT };
}

// "มูลค่าสินค้าสวัสดิการที่เสียไป(ของฟรี) แต่ละเดือน" — IsWelfare lines on
// APPROVED Issue documents only (DRAFT/SUBMITTED haven't actually left the
// warehouse yet). UnitPrice on a welfare line is always forced to 0 at
// approval time (see inv_issue_detail — "ราคาต่อหน่วยบังคับเป็น 0 เสมอ"),
// so "value given away" has to come from the product's cost, not the
// issue line's own price — same ESTIMATE caveat as the stock trend above.
export async function getWelfareValueByMonth(months = 6): Promise<DashboardResult> {
  const monthDefs = buildTrailingMonths(months);
  const [lines, products] = await Promise.all([
    prisma.invIssueDetail.findMany({
      where: { IsWelfare: true, Header: { Status: "APPROVED", DeliveryDate: { gte: monthDefs[0].start } } },
      select: { Qty: true, ProductCode: true, Header: { select: { DeliveryDate: true } } },
    }),
    prisma.invProduct.findMany({ select: { ProductCode: true, UnitCost: true } }),
  ]);
  const unitCost = new Map(products.map((p) => [p.ProductCode, p.UnitCost]));

  const data = monthDefs.map((m) => {
    let value = new Prisma.Decimal(0);
    for (const l of lines) {
      if (l.Header.DeliveryDate >= m.start && l.Header.DeliveryDate <= m.end) value = value.add(l.Qty.mul(unitCost.get(l.ProductCode) ?? 0));
    }
    return { label: m.label, value: Number(value.toFixed(2)) };
  });
  return { data, unit: ESTIMATE_UNIT };
}

// --- Gender/age by site (grouped bar) — 2026-09-24 ---------------------
export interface GroupedResult {
  groups: string[];
  series: { name: string; values: number[] }[];
  unit: string;
}

const TOP_SITE_CAP = 10;
export const OTHER_SITE_LABEL = "อื่นๆ";

export function topSitesOf(employees: { Site: { SiteName: string } | null }[]): { topSites: string[]; labelFor: (raw: string) => string } {
  const headcount = new Map<string, number>();
  for (const e of employees) {
    const label = e.Site?.SiteName ?? "(ไม่ระบุหน่วยงาน)";
    headcount.set(label, (headcount.get(label) ?? 0) + 1);
  }
  const topSites = [...headcount.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_SITE_CAP).map(([k]) => k);
  const topSet = new Set(topSites);
  return { topSites, labelFor: (raw) => (topSet.has(raw) ? raw : OTHER_SITE_LABEL) };
}

// Capped to the top 10 sites by headcount + "อื่นๆ" — a grouped bar chart
// with all 28+ real sites side by side would be unreadable regardless of
// color; the uncapped breakdown is always available via the table view's
// per-metric data, just not as a wall-to-wall chart.
export async function getGenderBySite(filters: ReportFilters): Promise<GroupedResult> {
  const employees = await prisma.mstEmployee.findMany({ where: employeeWhere(filters), include: { Site: true } });
  const { topSites, labelFor } = topSitesOf(employees);

  const genderKeys: (Gender | "UNKNOWN")[] = ["MALE", "FEMALE", "OTHER", "UNKNOWN"];
  const counts = new Map<string, Map<Gender | "UNKNOWN", number>>();
  let hasOther = false;
  for (const e of employees) {
    const site = labelFor(e.Site?.SiteName ?? "(ไม่ระบุหน่วยงาน)");
    if (site === OTHER_SITE_LABEL) hasOther = true;
    const g = e.Gender as Gender | null;
    const key: Gender | "UNKNOWN" = g && genderKeys.includes(g) ? g : "UNKNOWN";
    if (!counts.has(site)) counts.set(site, new Map());
    const bucket = counts.get(site)!;
    bucket.set(key, (bucket.get(key) ?? 0) + 1);
  }

  const groups = hasOther ? [...topSites, OTHER_SITE_LABEL] : topSites;
  const series = genderKeys
    .map((key) => ({ name: key === "UNKNOWN" ? "ไม่ระบุ" : GENDER_LABELS[key], values: groups.map((g) => counts.get(g)?.get(key) ?? 0) }))
    .filter((s) => s.values.some((v) => v > 0));

  return { groups, series, unit: "คน" };
}

// --- Site performance / uniform P&L (2026-09-28) -----------------------

// "ผลประกอบการแต่ละหน่วยงาน" — per site: MonthlyServiceFee (the site's
// monthly revenue, set on the หน่วยงาน (Site) screen) vs. total employee
// INCOME for that site in the selected period. "รายได้พนักงาน" is GROSS
// income only (GrossWage + OtherIncome, the two INCOME-side totals on
// trn_payroll_transaction) — explicitly NOT NetPay and explicitly NOT
// netted against any DEDUCTION-side figure, per the user's correction
// while this was being built ("รายได้อย่างเดียวนะ ไม่ใช่ netpay
// ผลประกอบการ" / "รายการหักไม่เอามาคิดนะ"). Grouped by Employee.Site (the
// employee's own DefaultSiteCode), same reasoning as getCostBySite above —
// trn_payroll_transaction.SiteCode is just "whichever site's worksheet
// touched this transaction last".
export interface SitePerformanceRow {
  siteCode: string;
  label: string;
  headcount: number;
  revenue: number; // MonthlyServiceFee
  employeeIncome: number; // GrossWage + OtherIncome, summed
  profit: number; // revenue - employeeIncome
  percent: number; // profit / revenue * 100 — "กำไร/ขาดทุน(%)", can go negative (0 when revenue is 0/unset)
}
export interface SitePerformanceResult {
  rows: SitePerformanceRow[];
}

export async function getSitePerformance(periodId: number, filters: ReportFilters): Promise<SitePerformanceResult> {
  const transactions = await prisma.trnPayrollTransaction.findMany({
    where: { PeriodID: periodId, Employee: employeeWhere(filters) },
    include: { Employee: { include: { Site: true } } },
  });

  const headcount = new Map<string, number>();
  const income = new Map<string, number>();
  const siteName = new Map<string, string>();
  const revenueBySite = new Map<string, number>();
  for (const t of transactions) {
    const code = t.Employee.DefaultSiteCode;
    if (!code) continue; // no site to attribute this employee's income to
    headcount.set(code, (headcount.get(code) ?? 0) + 1);
    income.set(code, (income.get(code) ?? 0) + Number(t.GrossWage) + Number(t.OtherIncome));
    siteName.set(code, t.Employee.Site?.SiteName ?? code);
    revenueBySite.set(code, t.Employee.Site?.MonthlyServiceFee ? Number(t.Employee.Site.MonthlyServiceFee) : 0);
  }

  const rows: SitePerformanceRow[] = [...siteName.keys()]
    .map((code) => {
      const revenue = revenueBySite.get(code) ?? 0;
      const employeeIncome = Math.round((income.get(code) ?? 0) * 100) / 100;
      const profit = Math.round((revenue - employeeIncome) * 100) / 100;
      const percent = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0;
      return { siteCode: code, label: siteName.get(code)!, headcount: headcount.get(code) ?? 0, revenue, employeeIncome, profit, percent };
    })
    .sort((a, b) => b.profit - a.profit);

  return { rows };
}

// "กำไร/ขาดทุน ค่าเครื่องแบบ" — รายได้(ยอดจำหน่าย) - ต้นทุนสินค้า, per
// site, for a calendar year+month (inv_issue_header isn't linked to
// sys_period at all — confirmed with the user to use DeliveryDate directly
// rather than force-fitting a payroll period onto it). Revenue = the
// Amount already recorded on non-welfare Issue lines of APPROVED
// documents (welfare lines are always priced at 0 — see inv_issue_detail —
// so they'd contribute nothing to revenue anyway, but are excluded
// explicitly to match "ยอดเงินรวม ไม่รวมสวัสดิการ" used elsewhere in this
// app). Cost uses inv_product's CURRENT UnitCost (weighted-average,
// recomputed on every Purchase approval) applied to every line regardless
// of when it was sold — same acknowledged ESTIMATE limitation as
// getStockValueByMonth/getWelfareValueByMonth above (no historical cost
// snapshot exists per sale). Grouped by the selling employee's
// DefaultSiteCode (inv_issue_header has no site of its own — an issue is
// always "to an employee", not "at a site").
export const UNIFORM_PROFIT_UNIT = "บาท (ต้นทุนใช้ค่าปัจจุบัน ประมาณการ)";

export interface UniformProfitRow {
  siteCode: string;
  label: string;
  revenue: number;
  cost: number;
  profit: number;
}
export interface UniformProfitResult {
  rows: UniformProfitRow[];
}

export async function getUniformProfitBySite(year: number, month: number, filters: ReportFilters): Promise<UniformProfitResult> {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const [lines, products] = await Promise.all([
    prisma.invIssueDetail.findMany({
      where: { IsWelfare: false, Header: { Status: "APPROVED", DeliveryDate: { gte: start, lte: end }, Employee: employeeWhere(filters) } },
      select: {
        ProductCode: true,
        Qty: true,
        Amount: true,
        Header: { select: { Employee: { select: { DefaultSiteCode: true, Site: { select: { SiteName: true } } } } } },
      },
    }),
    prisma.invProduct.findMany({ select: { ProductCode: true, UnitCost: true } }),
  ]);
  const unitCost = new Map(products.map((p) => [p.ProductCode, p.UnitCost]));

  const revenue = new Map<string, number>();
  const cost = new Map<string, number>();
  const siteName = new Map<string, string>();
  for (const l of lines) {
    const code = l.Header.Employee.DefaultSiteCode ?? "(ไม่ระบุหน่วยงาน)";
    siteName.set(code, l.Header.Employee.DefaultSiteCode ? (l.Header.Employee.Site?.SiteName ?? code) : "(ไม่ระบุหน่วยงาน)");
    revenue.set(code, (revenue.get(code) ?? 0) + Number(l.Amount));
    cost.set(code, (cost.get(code) ?? 0) + Number(l.Qty) * Number(unitCost.get(l.ProductCode) ?? 0));
  }

  const rows: UniformProfitRow[] = [...siteName.keys()]
    .map((code) => {
      const rev = Math.round((revenue.get(code) ?? 0) * 100) / 100;
      const c = Math.round((cost.get(code) ?? 0) * 100) / 100;
      return { siteCode: code, label: siteName.get(code)!, revenue: rev, cost: c, profit: Math.round((rev - c) * 100) / 100 };
    })
    .sort((a, b) => b.profit - a.profit);

  return { rows };
}

export async function getAgeBySite(filters: ReportFilters): Promise<GroupedResult> {
  const employees = await prisma.mstEmployee.findMany({ where: employeeWhere(filters), include: { Site: true } });
  const { topSites, labelFor } = topSitesOf(employees);

  // AGE_BUCKETS plus one trailing slot for ages that don't land in any
  // bucket (corrupt BirthDate, e.g. a Buddhist-era year stored straight
  // into the Gregorian column) — see getAgeDistribution() for why this
  // needs to be visible rather than silently dropped.
  const bucketCount = AGE_BUCKETS.length + 1;
  const invalidIdx = AGE_BUCKETS.length;
  const counts = new Map<string, number[]>();
  let hasOther = false;
  let hasInvalid = false;
  for (const e of employees) {
    const site = labelFor(e.Site?.SiteName ?? "(ไม่ระบุหน่วยงาน)");
    if (site === OTHER_SITE_LABEL) hasOther = true;
    if (!e.BirthDate) continue; // unknown age not counted, same as getAgeDistribution()
    const age = calculateAge(e.BirthDate);
    const idx = AGE_BUCKETS.findIndex((b) => age >= b.min && age <= b.max);
    if (!counts.has(site)) counts.set(site, new Array(bucketCount).fill(0));
    if (idx >= 0) counts.get(site)![idx] += 1;
    else {
      counts.get(site)![invalidIdx] += 1;
      hasInvalid = true;
    }
  }

  const groups = hasOther ? [...topSites, OTHER_SITE_LABEL] : topSites;
  const series = AGE_BUCKETS.map((b, i) => ({ name: b.label, values: groups.map((g) => counts.get(g)?.[i] ?? 0) }));
  if (hasInvalid) series.push({ name: INVALID_AGE_LABEL, values: groups.map((g) => counts.get(g)?.[invalidIdx] ?? 0) });

  return { groups, series, unit: "คน" };
}

// "วิเคราะห์ค่าเสียหาย" (2026-10-09, replaces the old "หนี้สูญ" metric) —
// three damage categories for one calendar year (+ optional month, + optional
// site):
//   STOCK_LOSS — CONFIRMED ADJUST movements with a NEGATIVE Qty (what an
//                approved stock count writes when the count is below the
//                ledger), valued at the product's CURRENT UnitCost. A
//                warehouse has no site/employee, so these rows are grouped by
//                warehouse and are left out entirely when a site filter is set.
//   BAD_DEBT   — OPEN inv_employee_debt of employees whose EmployeeStatus is
//                RESIGNED and whose ResignDate falls in the period.
//   WELFARE    — IsWelfare lines of APPROVED Issue documents (price is forced
//                to 0 on those lines, so the damage is Qty x current UnitCost),
//                by DeliveryDate. Attributed to the employee's DefaultSiteCode.
// Cost uses today's UnitCost (no per-sale cost snapshot exists) — an estimate,
// same caveat as the stock/welfare trend metrics above.
export type DamageCategory = "STOCK_LOSS" | "BAD_DEBT" | "WELFARE";
export const DAMAGE_CATEGORY_LABELS: Record<DamageCategory, string> = {
  STOCK_LOSS: "ค่าเสียหายจากการนับสต๊อก (ของหาย)",
  BAD_DEBT: "หนี้สูญ (พนักงานลาออกแต่ยังมีหนี้ค้าง)",
  WELFARE: "สวัสดิการ (ค่าชุดไม่มีราคา แต่มีต้นทุน)",
};
export const DAMAGE_UNIT = "บาท (ต้นทุนใช้ค่าปัจจุบัน ประมาณการ)";

export interface DamageRow {
  category: DamageCategory;
  categoryLabel: string;
  key: string; // empCode, or warehouse code for STOCK_LOSS — identifies the row for the detail drilldown
  siteName: string; // employee's site, or "คลัง: <warehouse>" for STOCK_LOSS
  empCode: string | null;
  fullName: string | null;
  startDate: string;
  resignDate: string;
  tenure: string;
  amount: number;
}
export interface DamageResult {
  categories: ChartDatum[];
  rows: DamageRow[];
  unit: string;
  stockLossExcluded: boolean; // true when a site filter hides STOCK_LOSS (warehouses have no site)
}

// Buddhist-era YYYY-MM-DD: keeps the app-wide พ.ศ. display convention while
// still sorting correctly as a plain string.
export function fmtDateBE(d: Date | null | undefined): string {
  if (!d) return "-";
  const iso = d.toISOString().slice(0, 10);
  return `${Number(iso.slice(0, 4)) + 543}${iso.slice(4)}`;
}

export function formatTenure(start: Date | null | undefined, end: Date | null | undefined): string {
  if (!start) return "-";
  const to = end ?? new Date();
  let months = (to.getUTCFullYear() - start.getUTCFullYear()) * 12 + (to.getUTCMonth() - start.getUTCMonth());
  if (to.getUTCDate() < start.getUTCDate()) months -= 1;
  if (months < 0) months = 0;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return y > 0 ? `${y} ปี ${m} เดือน` : `${m} เดือน`;
}

export function damagePeriodRange(year: number, month?: number): { start: Date; end: Date } {
  return month
    ? { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) }
    : { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
}

export async function buildDamageRows(year: number, month: number | undefined, filters: ReportFilters): Promise<{ rows: DamageRow[]; stockLossExcluded: boolean }> {
  const { start, end } = damagePeriodRange(year, month);
  const empWhere = employeeWhere(filters);
  const stockLossExcluded = !!filters.siteCode;
  const empInfo = (e: { EmpCode: string; FullName: string; StartDate: Date | null; ResignDate: Date | null; Site: { SiteName: string } | null }) => ({
    empCode: e.EmpCode,
    fullName: e.FullName,
    siteName: e.Site?.SiteName ?? "(ไม่ระบุหน่วยงาน)",
    startDate: fmtDateBE(e.StartDate),
    resignDate: fmtDateBE(e.ResignDate),
    tenure: formatTenure(e.StartDate, e.ResignDate),
  });
  const empSelect = { EmpCode: true, FullName: true, StartDate: true, ResignDate: true, Site: { select: { SiteName: true } } } as const;

  const [stockLines, welfareLines, resigned, products] = await Promise.all([
    stockLossExcluded
      ? Promise.resolve([])
      : prisma.invStockMovementDetail.findMany({
          where: {
            Qty: { lt: 0 },
            Movement: {
              MovementType: "ADJUST",
              Status: "CONFIRMED",
              MovementDate: { gte: start, lt: end },
              ...(filters.allowedCompanyCodes ? { Warehouse: { CompanyCode: { in: filters.allowedCompanyCodes } } } : {}),
            },
          },
          select: { ProductCode: true, Qty: true, Movement: { select: { WarehouseCode: true, Warehouse: { select: { WarehouseName: true } } } } },
        }),
    prisma.invIssueDetail.findMany({
      where: { IsWelfare: true, Header: { Status: "APPROVED", DeliveryDate: { gte: start, lt: end }, Employee: empWhere } },
      select: { ProductCode: true, Qty: true, Header: { select: { Employee: { select: empSelect } } } },
    }),
    prisma.mstEmployee.findMany({
      where: { ...empWhere, EmployeeStatus: "RESIGNED", ResignDate: { gte: start, lt: end } },
      select: { ...empSelect, Debts: { where: { Status: "OPEN", RemainingAmount: { gt: 0 } }, select: { RemainingAmount: true } } },
    }),
    prisma.invProduct.findMany({ select: { ProductCode: true, UnitCost: true } }),
  ]);
  const unitCost = new Map(products.map((p) => [p.ProductCode, Number(p.UnitCost)]));
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const rows: DamageRow[] = [];

  const stockByWh = new Map<string, { name: string; amount: number }>();
  for (const l of stockLines) {
    const wh = l.Movement.WarehouseCode;
    const cur = stockByWh.get(wh) ?? { name: l.Movement.Warehouse.WarehouseName, amount: 0 };
    cur.amount += Math.abs(Number(l.Qty)) * (unitCost.get(l.ProductCode) ?? 0);
    stockByWh.set(wh, cur);
  }
  for (const [wh, v] of stockByWh) {
    if (v.amount <= 0) continue;
    rows.push({ category: "STOCK_LOSS", categoryLabel: DAMAGE_CATEGORY_LABELS.STOCK_LOSS, key: wh, siteName: `คลัง: ${v.name}`, empCode: null, fullName: null, startDate: "-", resignDate: "-", tenure: "-", amount: round2(v.amount) });
  }

  for (const e of resigned) {
    const amount = round2(e.Debts.reduce((s, d) => s + Number(d.RemainingAmount), 0));
    if (amount <= 0) continue;
    rows.push({ category: "BAD_DEBT", categoryLabel: DAMAGE_CATEGORY_LABELS.BAD_DEBT, key: e.EmpCode, ...empInfo(e), amount });
  }

  const welfareByEmp = new Map<string, DamageRow>();
  for (const l of welfareLines) {
    const e = l.Header.Employee;
    const amt = Number(l.Qty) * (unitCost.get(l.ProductCode) ?? 0);
    const row: DamageRow = welfareByEmp.get(e.EmpCode) ?? { category: "WELFARE", categoryLabel: DAMAGE_CATEGORY_LABELS.WELFARE, key: e.EmpCode, ...empInfo(e), amount: 0 };
    row.amount += amt;
    welfareByEmp.set(e.EmpCode, row);
  }
  for (const row of welfareByEmp.values()) {
    row.amount = round2(row.amount);
    if (row.amount > 0) rows.push(row);
  }

  rows.sort((a, b) => b.amount - a.amount);
  return { rows, stockLossExcluded };
}

export async function getDamageAnalysis(year: number, month: number | undefined, filters: ReportFilters): Promise<DamageResult> {
  const { rows, stockLossExcluded } = await buildDamageRows(year, month, filters);
  const categories = (Object.keys(DAMAGE_CATEGORY_LABELS) as DamageCategory[]).map((c) => ({
    label: DAMAGE_CATEGORY_LABELS[c],
    value: Math.round(rows.filter((r) => r.category === c).reduce((s, r) => s + r.amount, 0) * 100) / 100,
  }));
  return { categories, rows, unit: DAMAGE_UNIT, stockLossExcluded };
}
