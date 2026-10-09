import "server-only";
import { prisma } from "@/lib/prisma";
import { EMPLOYEE_TYPE_LABELS, GENDER_LABELS, type EmployeeType, type Gender } from "@/lib/validation";
import { employeeWhere, type ReportFilters } from "./types";
import { calculateAge, AGE_BUCKETS, INVALID_AGE_LABEL, OTHER_SITE_LABEL, topSitesOf, buildDamageRows, damagePeriodRange, fmtDateBE as fmtBE, type DamageCategory } from "./dashboard-data";

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

// "วิเคราะห์ค่าเสียหาย" drilldown (2026-10-09) — two levels:
//  1) category (chart slice/bar click) -> the site/employee table for that
//     category (same rows the main table view shows, filtered to one category)
//  2) one row of that table (empCode, or warehouse code for STOCK_LOSS) -> the
//     underlying lines (debts / welfare products / lost-stock products).
export async function getDamageCategoryDrilldown(categoryLabel: string, year: number, month: number | undefined, filters: ReportFilters): Promise<DrilldownResult> {
  const { rows } = await buildDamageRows(year, month, filters);
  const filtered = rows.filter((r) => r.categoryLabel === categoryLabel);
  const isStock = filtered[0]?.category === "STOCK_LOSS";
  const columns: DrilldownColumn[] = [
    { key: "siteName", label: isStock ? "คลัง" : "หน่วยงาน" },
    ...(isStock ? [] : [...EMP_COLS, { key: "startDate", label: "วันเริ่มงาน" }, { key: "resignDate", label: "วันลาออก" }, { key: "tenure", label: "อายุงาน" }]),
    { key: "amount", label: "ค่าเสียหาย (บาท)", align: "right" },
  ];
  return {
    columns,
    rows: filtered.map((r) => ({ siteName: r.siteName, empCode: r.empCode ?? "-", fullName: r.fullName ?? "-", startDate: r.startDate, resignDate: r.resignDate, tenure: r.tenure, amount: r.amount })),
  };
}

export async function getDamageDetailDrilldown(category: DamageCategory, key: string, year: number, month: number | undefined, filters: ReportFilters): Promise<DrilldownResult> {
  const { start, end } = damagePeriodRange(year, month);
  const products = await prisma.invProduct.findMany({ select: { ProductCode: true, ProductName: true, UnitCost: true } });
  const pmap = new Map(products.map((p) => [p.ProductCode, p]));
  const productCols: DrilldownColumn[] = [
    { key: "product", label: "สินค้า" },
    { key: "date", label: "วันที่" },
    { key: "qty", label: "จำนวน", align: "right" },
    { key: "unitCost", label: "ต้นทุน/หน่วย (บาท)", align: "right" },
    { key: "amount", label: "มูลค่า (บาท)", align: "right" },
  ];
  const productRow = (code: string, date: Date, qty: number) => {
    const p = pmap.get(code);
    const cost = Number(p?.UnitCost ?? 0);
    return { product: `${code} ${p?.ProductName ?? ""}`.trim(), date: fmtBE(date), qty, unitCost: cost, amount: Math.round(qty * cost * 100) / 100 };
  };

  if (category === "BAD_DEBT") {
    const debts = await prisma.invEmployeeDebt.findMany({
      where: { EmpCode: key, Status: "OPEN", RemainingAmount: { gt: 0 }, Employee: employeeWhere(filters) },
      include: { DeductionType: { select: { DeductionName: true } } },
      orderBy: { RemainingAmount: "desc" },
    });
    return {
      columns: [
        { key: "debtType", label: "ประเภทหนี้" },
        { key: "totalAmount", label: "ยอดเต็ม (บาท)", align: "right" },
        { key: "paidAmount", label: "ชำระแล้ว (บาท)", align: "right" },
        { key: "remainingAmount", label: "คงเหลือ (บาท)", align: "right" },
        { key: "description", label: "หมายเหตุ" },
      ],
      rows: debts.map((d) => ({
        debtType: d.DeductionType?.DeductionName ?? d.DeductionCode ?? "-",
        totalAmount: Number(d.TotalAmount),
        paidAmount: Number(d.PaidAmount),
        remainingAmount: Number(d.RemainingAmount),
        description: d.Description ?? "-",
      })),
    };
  }

  if (category === "WELFARE") {
    const lines = await prisma.invIssueDetail.findMany({
      where: { IsWelfare: true, Header: { Status: "APPROVED", DeliveryDate: { gte: start, lt: end }, EmpCode: key, Employee: employeeWhere(filters) } },
      select: { ProductCode: true, Qty: true, Header: { select: { DeliveryDate: true } } },
      orderBy: { Header: { DeliveryDate: "asc" } },
    });
    return { columns: productCols, rows: lines.map((l) => productRow(l.ProductCode, l.Header.DeliveryDate, Number(l.Qty))) };
  }

  // STOCK_LOSS — key is the warehouse code
  const lines = await prisma.invStockMovementDetail.findMany({
    where: {
      Qty: { lt: 0 },
      Movement: {
        MovementType: "ADJUST",
        Status: "CONFIRMED",
        WarehouseCode: key,
        MovementDate: { gte: start, lt: end },
        ...(filters.allowedCompanyCodes ? { Warehouse: { CompanyCode: { in: filters.allowedCompanyCodes } } } : {}),
      },
    },
    select: { ProductCode: true, Qty: true, Movement: { select: { MovementDate: true } } },
    orderBy: { Movement: { MovementDate: "asc" } },
  });
  return { columns: productCols, rows: lines.map((l) => productRow(l.ProductCode, l.Movement.MovementDate, Math.abs(Number(l.Qty)))) };
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
