import "server-only";
import { prisma } from "@/lib/prisma";
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

export async function getAgeDistribution(filters: ReportFilters): Promise<DashboardResult> {
  const employees = await prisma.mstEmployee.findMany({
    where: { ...employeeWhere(filters), BirthDate: { not: null } },
    select: { BirthDate: true },
  });
  const counts = AGE_BUCKETS.map(() => 0);
  for (const e of employees) {
    const age = calculateAge(e.BirthDate!);
    const idx = AGE_BUCKETS.findIndex((b) => age >= b.min && age <= b.max);
    if (idx >= 0) counts[idx] += 1;
  }
  return { data: AGE_BUCKETS.map((b, i) => ({ label: b.label, value: counts[i] })), unit: "คน" };
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
