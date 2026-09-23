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

function calculateAge(birthDate: Date, asOf: Date = new Date()): number {
  let age = asOf.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear = asOf.getMonth() > birthDate.getMonth() || (asOf.getMonth() === birthDate.getMonth() && asOf.getDate() >= birthDate.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

// Ordered buckets (not a categorical breakdown — a histogram over one
// continuous variable), so charts render this with a single sequential hue
// rather than per-bucket categorical colors, except in pie mode where each
// slice still needs its own hue to be legible at all.
const AGE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "< 20 ปี", min: 0, max: 19 },
  { label: "20-29 ปี", min: 20, max: 29 },
  { label: "30-39 ปี", min: 30, max: 39 },
  { label: "40-49 ปี", min: 40, max: 49 },
  { label: "50-59 ปี", min: 50, max: 59 },
  { label: "60 ปีขึ้นไป", min: 60, max: 999 },
];

const INVALID_AGE_LABEL = "ข้อมูลวันเกิดไม่ถูกต้อง";

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
const OTHER_SITE_LABEL = "อื่นๆ";

function topSitesOf(employees: { Site: { SiteName: string } | null }[]): { topSites: string[]; labelFor: (raw: string) => string } {
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
