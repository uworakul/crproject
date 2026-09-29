import "server-only";
import { prisma } from "@/lib/prisma";
import { EMPLOYEE_TYPE_LABELS, GENDER_LABELS, type EmployeeType, type Gender } from "@/lib/validation";
import { employeeWhere, type ReportFilters } from "./types";
import { calculateAge, AGE_BUCKETS, INVALID_AGE_LABEL, OTHER_SITE_LABEL, topSitesOf } from "./dashboard-data";

// Drill-down (2026-09-28) — clicking any bucket/bar/slice/row on the
// Dashboard shows the underlying employees (or, for leave stats, the
// underlying leave requests) in a plain table: which employee, plus
// whatever fields explain *why* they landed in that bucket (e.g. the "age"
// metric shows BirthDate + the computed age, not just the employee list).
// Every function here re-derives the same bucketing logic the matching
// chart function in dashboard-data.ts already uses, then filters down to
// the one bucket/group+series the user clicked — so the drilldown table's
// row count always matches the chart's own number for that slice.
export interface DrilldownColumn {
  key: string;
  label: string;
  align?: "left" | "right";
}
export interface DrilldownResult {
  columns: DrilldownColumn[];
  rows: Record<string, string | number>[];
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "-";
  return d.toISOString().slice(0, 10);
}

const EMP_COLS: DrilldownColumn[] = [
  { key: "empCode", label: "รหัสพนักงาน" },
  { key: "fullName", label: "ชื่อ-นามสกุล" },
];

const NO_SITE_LABEL = "(ไม่ระบุหน่วยงาน)";

export async function getAgeDrilldown(bucketLabel: string, filters: ReportFilters): Promise<DrilldownResult> {
  const employees = await prisma.mstEmployee.findMany({
    where: { ...employeeWhere(filters), BirthDate: { not: null } },
    select: { EmpCode: true, FullName: true, BirthDate: true, Site: { select: { SiteName: true } } },
  });
  const rows = employees
    .map((e) => {
      const age = calculateAge(e.BirthDate!);
      const idx = AGE_BUCKETS.findIndex((b) => age >= b.min && age <= b.max);
      return { bucket: idx >= 0 ? AGE_BUCKETS[idx].label : INVALID_AGE_LABEL, e, age };
    })
    .filter((r) => r.bucket === bucketLabel)
    .map((r) => ({
      empCode: r.e.EmpCode,
      fullName: r.e.FullName,
      birthDate: fmtDate(r.e.BirthDate),
      age: r.age,
      site: r.e.Site?.SiteName ?? "-",
    }));
  return {
    columns: [...EMP_COLS, { key: "birthDate", label: "วันเกิด" }, { key: "age", label: "อายุ (ปี)", align: "right" }, { key: "site", label: "หน่วยงาน" }],
    rows,
  };
}

export async function getHeadcountBySiteDrilldown(siteLabel: string, filters: ReportFilters): Promise<DrilldownResult> {
  const employees = await prisma.mstEmployee.findMany({
    where: employeeWhere(filters),
    select: {
      EmpCode: true,
      FullName: true,
      EmployeeType: true,
      Site: { select: { SiteName: true } },
      Department: { select: { DeptName: true } },
      Position: { select: { PositionName: true } },
    },
  });
  const rows = employees
    .filter((e) => (e.Site?.SiteName ?? NO_SITE_LABEL) === siteLabel)
    .map((e) => ({
      empCode: e.EmpCode,
      fullName: e.FullName,
      dept: e.Department?.DeptName ?? "-",
      position: e.Position?.PositionName ?? "-",
      employeeType: EMPLOYEE_TYPE_LABELS[e.EmployeeType as EmployeeType] ?? e.EmployeeType,
    }));
  return {
    columns: [...EMP_COLS, { key: "dept", label: "แผนก" }, { key: "position", label: "ตำแหน่ง" }, { key: "employeeType", label: "ประเภทพนักงาน" }],
    rows,
  };
}

export async function getCostBySiteDrilldown(siteLabel: string, periodId: number, filters: ReportFilters): Promise<DrilldownResult> {
  const transactions = await prisma.trnPayrollTransaction.findMany({
    where: { PeriodID: periodId, Employee: employeeWhere(filters) },
    select: { NetPay: true, Employee: { select: { EmpCode: true, FullName: true, Site: { select: { SiteName: true } } } } },
  });
  const rows = transactions
    .filter((t) => (t.Employee.Site?.SiteName ?? NO_SITE_LABEL) === siteLabel)
    .map((t) => ({ empCode: t.Employee.EmpCode, fullName: t.Employee.FullName, netPay: Number(t.NetPay) }))
    .sort((a, b) => b.netPay - a.netPay);
  return { columns: [...EMP_COLS, { key: "netPay", label: "ค่าใช้จ่ายสุทธิ (บาท)", align: "right" }], rows };
}

export async function getGenderBySiteDrilldown(group: string, series: string, filters: ReportFilters): Promise<DrilldownResult> {
  const employees = await prisma.mstEmployee.findMany({
    where: employeeWhere(filters),
    select: { EmpCode: true, FullName: true, Gender: true, Site: { select: { SiteName: true } } },
  });
  const { topSites } = topSitesOf(employees);
  const genderKeys: (Gender | "UNKNOWN")[] = ["MALE", "FEMALE", "OTHER", "UNKNOWN"];
  const seriesKey: Gender | "UNKNOWN" | undefined =
    series === "ไม่ระบุ" ? "UNKNOWN" : (Object.entries(GENDER_LABELS).find(([, label]) => label === series)?.[0] as Gender | undefined);

  const rows = employees
    .filter((e) => {
      const siteLabel = e.Site?.SiteName ?? NO_SITE_LABEL;
      const matchesGroup = group === OTHER_SITE_LABEL ? !topSites.includes(siteLabel) : siteLabel === group;
      if (!matchesGroup) return false;
      const g = e.Gender as Gender | null;
      const key: Gender | "UNKNOWN" = g && genderKeys.includes(g) ? g : "UNKNOWN";
      return key === seriesKey;
    })
    .map((e) => ({ empCode: e.EmpCode, fullName: e.FullName, site: e.Site?.SiteName ?? NO_SITE_LABEL, gender: series }));
  return { columns: [...EMP_COLS, { key: "site", label: "หน่วยงาน" }, { key: "gender", label: "เพศ" }], rows };
}

export async function getAgeBySiteDrilldown(group: string, series: string, filters: ReportFilters): Promise<DrilldownResult> {
  const employees = await prisma.mstEmployee.findMany({
    where: employeeWhere(filters),
    select: { EmpCode: true, FullName: true, BirthDate: true, Site: { select: { SiteName: true } } },
  });
  const { topSites } = topSitesOf(employees);

  const rows = employees
    .filter((e) => {
      const siteLabel = e.Site?.SiteName ?? NO_SITE_LABEL;
      const matchesGroup = group === OTHER_SITE_LABEL ? !topSites.includes(siteLabel) : siteLabel === group;
      if (!matchesGroup || !e.BirthDate) return false;
      const age = calculateAge(e.BirthDate);
      const idx = AGE_BUCKETS.findIndex((b) => age >= b.min && age <= b.max);
      const bucket = idx >= 0 ? AGE_BUCKETS[idx].label : INVALID_AGE_LABEL;
      return bucket === series;
    })
    .map((e) => ({
      empCode: e.EmpCode,
      fullName: e.FullName,
      birthDate: fmtDate(e.BirthDate),
      age: calculateAge(e.BirthDate!),
      site: e.Site?.SiteName ?? NO_SITE_LABEL,
    }));
  return {
    columns: [...EMP_COLS, { key: "birthDate", label: "วันเกิด" }, { key: "age", label: "อายุ (ปี)", align: "right" }, { key: "site", label: "หน่วยงาน" }],
    rows,
  };
}

// "หนี้สูญ" drilldown (2026-09-29) — unlike every other drilldown here
// (click a bucket -> see the employees in it), this one is triggered by a
// "ดูรายละเอียด" button on a specific ROW of getResignedEmployeeBadDebt's
// table (see BadDebtTableView in charts.tsx), keyed by empCode rather than
// a bucket/group+series label. Shows that one employee's individual OPEN
// debt lines (not merged by category — a resigned employee rarely has more
// than a couple, so there's no need for the ADVANCE-group merge
// payment-history.ts uses for its filter dropdown).
export async function getBadDebtDrilldown(empCode: string): Promise<DrilldownResult> {
  const debts = await prisma.invEmployeeDebt.findMany({
    where: { EmpCode: empCode, Status: "OPEN", RemainingAmount: { gt: 0 } },
    include: { DeductionType: { select: { DeductionName: true } } },
    orderBy: { RemainingAmount: "desc" },
  });
  const rows = debts.map((d) => ({
    debtType: d.DeductionType?.DeductionName ?? d.DeductionCode ?? "-",
    totalAmount: Number(d.TotalAmount),
    paidAmount: Number(d.PaidAmount),
    remainingAmount: Number(d.RemainingAmount),
    description: d.Description ?? "-",
  }));
  return {
    columns: [
      { key: "debtType", label: "ประเภทหนี้" },
      { key: "totalAmount", label: "ยอดเต็ม (บาท)", align: "right" },
      { key: "paidAmount", label: "ชำระแล้ว (บาท)", align: "right" },
      { key: "remainingAmount", label: "คงเหลือ (บาท)", align: "right" },
      { key: "description", label: "หมายเหตุ" },
    ],
    rows,
  };
}

export async function getLeaveStatsDrilldown(leaveTypeName: string, year: number, filters: ReportFilters): Promise<DrilldownResult> {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const leaveType = await prisma.mstLeaveType.findFirst({ where: { LeaveTypeName: leaveTypeName }, select: { LeaveTypeCode: true } });
  if (!leaveType) return { columns: [...EMP_COLS], rows: [] };

  const requests = await prisma.trnLeaveRequest.findMany({
    where: { Status: "APPROVED", StartDate: { gte: yearStart, lt: yearEnd }, LeaveTypeCode: leaveType.LeaveTypeCode, Employee: employeeWhere(filters) },
    select: { StartDate: true, EndDate: true, TotalDays: true, Employee: { select: { EmpCode: true, FullName: true } } },
    orderBy: { StartDate: "asc" },
  });
  const rows = requests.map((r) => ({
    empCode: r.Employee.EmpCode,
    fullName: r.Employee.FullName,
    startDate: fmtDate(r.StartDate),
    endDate: fmtDate(r.EndDate),
    totalDays: Number(r.TotalDays),
  }));
  return {
    columns: [...EMP_COLS, { key: "startDate", label: "วันที่เริ่มลา" }, { key: "endDate", label: "วันที่สิ้นสุด" }, { key: "totalDays", label: "จำนวนวัน", align: "right" }],
    rows,
  };
}
