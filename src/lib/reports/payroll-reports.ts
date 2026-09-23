import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "../../../generated/prisma/client";
import { getRationedDeductionBreakdown } from "@/lib/payroll";
import { employeeWhere, type ReportFilters } from "./types";
import type { GroupableRow } from "./group-sort";

const zero = new Prisma.Decimal(0);

// siteCode filters on Employee.DefaultSiteCode only (via employeeWhere,
// below) — deliberately NOT also ANDed against trn_payroll_transaction.
// SiteCode directly: that field is just "whichever site's worksheet
// touched this transaction last" (same field the "หน่วยงานหลัก" bug was
// about), so adding it as a second, stricter condition would wrongly drop
// a multi-site employee whose home site matches the filter but whose
// transaction's own SiteCode currently points elsewhere.
function periodTransactionWhere(periodId: number, filters: ReportFilters) {
  return {
    PeriodID: periodId,
    Employee: employeeWhere(filters),
  };
}

export interface PayslipLine {
  label: string;
  amount: string;
  days: string | null; // only set for INCOME lines sourced from a detail row (e.g. "ดึงข้อมูลจาก Worksheet") — matches the same Days/Hours convention already shown on the "คำนวณเงินได้ประจำงวด" screen's breakdown
  hours: string | null;
}

interface RawPayslipItem {
  code: string;
  label: string;
  amount: Prisma.Decimal;
  days: Prisma.Decimal | null;
  hours: Prisma.Decimal | null;
}

// 2026-09-22 — a multi-site employee's income lines split by SiteCode (see
// pullPayrollFromWorksheet()) mean the SAME income code (e.g. "01 ค่าแรง")
// can appear as two separate trn_payroll_transaction_detail rows, one per
// site. That per-site split is exactly right for the dept/site-summary
// matrix report, but the user wants the Payslip itself to show one
// employee's pay as ONE line per income code — summing both the amount AND
// the quantity (Days/Hours) across every line sharing that code, regardless
// of which site it came from. Legacy scalar fields (GrossWage/OT/etc.) get
// synthetic codes that can never collide with a real ref_income_type code,
// so they're never accidentally merged together.
function mergePayslipItems(raw: RawPayslipItem[]): PayslipLine[] {
  const byCode = new Map<string, RawPayslipItem>();
  for (const item of raw) {
    const existing = byCode.get(item.code);
    if (!existing) {
      byCode.set(item.code, { ...item });
      continue;
    }
    existing.amount = existing.amount.add(item.amount);
    if (item.days) existing.days = (existing.days ?? zero).add(item.days);
    if (item.hours) existing.hours = (existing.hours ?? zero).add(item.hours);
  }
  return [...byCode.values()].map((i) => ({
    label: i.label,
    amount: i.amount.toFixed(2),
    days: i.days && i.days.gt(0) ? i.days.toFixed(1) : null,
    hours: i.hours && i.hours.gt(0) ? i.hours.toFixed(1) : null,
  }));
}
export interface PayslipData {
  transactionId: number;
  empCode: string;
  fullName: string;
  companyName: string;
  deptName: string | null;
  positionName: string | null;
  siteName: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  periodLabel: string;
  incomeItems: PayslipLine[];
  deductionItems: PayslipLine[];
  totalIncome: string;
  totalDeduction: string;
  netPay: string;
}

// One payslip per matching trn_payroll_transaction — same breakdown logic
// as the "คำนวณเงินได้ประจำงวด" screen's expandable row (2026-09-21/22:
// hide zero-amount lines, statutory fields always computed fresh via
// getRationedDeductionBreakdown so the payslip never shows a stale number
// that doesn't match what was actually withheld).
export async function getPayslipRows(periodId: number, filters: ReportFilters): Promise<PayslipData[]> {
  const period = await prisma.sysPeriod.findUniqueOrThrow({ where: { PeriodID: periodId } });
  const transactions = await prisma.trnPayrollTransaction.findMany({
    where: periodTransactionWhere(periodId, filters),
    include: {
      // 2026-09-22: Employee.Site (the employee's own DefaultSiteCode), not
      // the top-level Site relation (trn_payroll_transaction.SiteCode) —
      // that field is just "whichever site's worksheet touched this
      // transaction last" and is wrong for an employee who worked more than
      // one site this period (same bug just fixed on /payroll/calculate's
      // "หน่วยงานหลัก" column — the user confirmed this must always come
      // from the employee master record, not the transaction).
      Employee: { include: { Department: true, Position: true, Bank: true, Company: true, Site: true } },
      Details: { orderBy: [{ LineType: "asc" }, { Code: "asc" }] },
    },
    orderBy: { EmpCode: "asc" },
  });

  const periodLabel = `งวด ${period.PeriodMonth}/${period.PeriodYear + 543} (${period.StartDate.toLocaleDateString("th-TH")} - ${period.EndDate.toLocaleDateString("th-TH")}) จ่าย ${period.PayDate.toLocaleDateString("th-TH")}`;

  const rows: PayslipData[] = [];
  for (const t of transactions) {
    const rawIncomeItems: RawPayslipItem[] = [];
    if (t.GrossWage.gt(0)) rawIncomeItems.push({ code: "LEGACY_GROSS", label: "ค่าแรง/เงินเดือน", amount: t.GrossWage, days: null, hours: null });
    if (t.OTAmount.gt(0)) rawIncomeItems.push({ code: "LEGACY_OT", label: "ค่าล่วงเวลา (OT)", amount: t.OTAmount, days: null, hours: null });
    if (t.PositionAllowance.gt(0)) rawIncomeItems.push({ code: "LEGACY_POSITION", label: "เงินประจำตำแหน่ง", amount: t.PositionAllowance, days: null, hours: null });
    if (t.ShiftAllowance.gt(0)) rawIncomeItems.push({ code: "LEGACY_SHIFT", label: "เบี้ยกะ", amount: t.ShiftAllowance, days: null, hours: null });
    for (const d of t.Details.filter((d) => d.LineType === "INCOME" && !d.Amount.equals(0))) {
      rawIncomeItems.push({ code: d.Code, label: d.Description, amount: d.Amount, days: d.Days, hours: d.Hours });
    }
    const incomeItems = mergePayslipItems(rawIncomeItems);

    const deductionItems: PayslipLine[] = [];
    if (t.TaxWithheld.gt(0)) deductionItems.push({ label: "ภาษีหัก ณ ที่จ่าย", amount: t.TaxWithheld.toFixed(2), days: null, hours: null });
    if (t.SSOAmount.gt(0)) deductionItems.push({ label: "ประกันสังคม", amount: t.SSOAmount.toFixed(2), days: null, hours: null });
    if (t.WelfareFundAmount.gt(0)) deductionItems.push({ label: "กองทุนสงเคราะห์พนักงาน", amount: t.WelfareFundAmount.toFixed(2), days: null, hours: null });
    const { items: rationedItems } = await getRationedDeductionBreakdown(t.TransactionID);
    for (const item of rationedItems.filter((i) => i.allocated.gt(0))) {
      deductionItems.push({ label: item.label, amount: item.allocated.toFixed(2), days: null, hours: null });
    }

    const totalIncome = incomeItems.reduce((s, i) => s.add(i.amount), zero);
    const totalDeduction = deductionItems.reduce((s, i) => s.add(i.amount), zero);

    rows.push({
      transactionId: t.TransactionID,
      empCode: t.EmpCode,
      fullName: t.Employee.FullName,
      companyName: t.Employee.Company?.CompanyName ?? "",
      deptName: t.Employee.Department?.DeptName ?? null,
      positionName: t.Employee.Position?.PositionName ?? null,
      siteName: t.Employee.Site?.SiteName ?? null,
      bankName: t.Employee.Bank?.BankNameTH ?? null,
      bankAccountNo: t.Employee.BankAccountNo,
      periodLabel,
      incomeItems,
      deductionItems,
      totalIncome: totalIncome.toFixed(2),
      totalDeduction: totalDeduction.toFixed(2),
      netPay: t.NetPay.toFixed(2),
    });
  }
  return rows;
}

export interface BankRemitRow extends GroupableRow {
  bankAccountNo: string | null;
  netPay: string;
}

// Only employees with NetPay > 0 are worth remitting; missing bank info is
// surfaced (bankName/bankAccountNo null) rather than silently excluded, so
// HR can spot who still needs their bank details filled in before payday.
export async function getBankRemittanceRows(periodId: number, filters: ReportFilters): Promise<BankRemitRow[]> {
  const transactions = await prisma.trnPayrollTransaction.findMany({
    where: { ...periodTransactionWhere(periodId, filters), NetPay: { gt: 0 } },
    include: { Employee: { include: { Bank: true, Department: true, Site: true } } },
    orderBy: [{ Employee: { BankCode: "asc" } }, { EmpCode: "asc" }],
  });
  return transactions.map((t) => ({
    empCode: t.EmpCode,
    fullName: t.Employee.FullName,
    deptCode: t.Employee.DeptCode,
    deptName: t.Employee.Department?.DeptName ?? null,
    siteCode: t.Employee.DefaultSiteCode,
    siteName: t.Employee.Site?.SiteName ?? null,
    bankCode: t.Employee.BankCode,
    bankName: t.Employee.Bank?.BankNameTH ?? null,
    employeeType: t.Employee.EmployeeType,
    bankAccountNo: t.Employee.BankAccountNo,
    netPay: t.NetPay.toFixed(2),
  }));
}

export interface MatrixReportResult {
  columns: { code: string; label: string; type: "INCOME" | "DEDUCTION" }[];
  rows: { groupCode: string; groupName: string; employeeCount: number; totalDays: string; amounts: Record<string, string>; netPay: string }[];
  grandTotal: { employeeCount: number; totalDays: string; amounts: Record<string, string>; netPay: string };
}

// Shared engine for "สรุปการจ่ายแยกประเภท ตามแผนก/ตามหน่วยงาน" — one row per
// dept-or-site, one column per distinct income/deduction TYPE that actually
// appears among the matching transactions (types vary run to run, so the
// column set can't be fixed up front). groupBy picks which employee/
// transaction dimension rows are bucketed by; everything else about the two
// reports is identical.
export async function getPaySummaryMatrix(periodId: number, filters: ReportFilters, groupBy: "DEPT" | "SITE"): Promise<MatrixReportResult> {
  const transactions = await prisma.trnPayrollTransaction.findMany({
    where: periodTransactionWhere(periodId, filters),
    include: {
      Employee: { include: { Department: true } },
      Site: true,
      Details: { where: { OR: [{ LineType: "INCOME" }, { LineType: "DEDUCTION" }] }, include: { Site: true } },
    },
  });

  const columnMap = new Map<string, { code: string; label: string; type: "INCOME" | "DEDUCTION" }>();
  for (const t of transactions) {
    for (const d of t.Details) {
      const key = `${d.LineType}:${d.Code}`;
      if (!columnMap.has(key)) columnMap.set(key, { code: d.Code, label: d.Description, type: d.LineType as "INCOME" | "DEDUCTION" });
    }
  }
  const columns = [...columnMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);

  interface GroupAcc {
    groupName: string;
    amounts: Map<string, Prisma.Decimal>;
    netPay: Prisma.Decimal;
    employeeCodes: Set<string>;
    totalDays: Prisma.Decimal;
  }
  function newGroup(groupName: string): GroupAcc {
    return { groupName, amounts: new Map<string, Prisma.Decimal>(), netPay: zero, employeeCodes: new Set<string>(), totalDays: zero };
  }

  const groupTotals = new Map<string, GroupAcc>();
  for (const t of transactions) {
    // สรุป "ตามหน่วยงาน" ต้องแยกตามหน่วยงานที่ทำงานจริงต่อบรรทัด (ไม่ใช่
    // t.SiteCode เดียวของทั้ง transaction ซึ่งเป็นแค่ "หน่วยงานล่าสุดที่แตะ" —
    // บั๊กเดียวกับที่เพิ่งแก้ไปที่ "หน่วยงานหลัก"/Payslip) — พนักงานที่ทำงาน 2
    // หน่วยงานในงวดเดียวมีบรรทัดรายได้ที่ Detail.SiteCode ต่างกันจริงอยู่แล้ว
    // (จาก "ดึงข้อมูลจาก Worksheet") จึงแยกยอดรายได้/รายการหักตามนั้นได้ตรงๆ —
    // ⚠️ "สุทธิ" ยังคงผูกกับ t.SiteCode เดียวเท่านั้น เพราะ NetPay เป็นตัวเลข
    // เดียวระดับทั้ง transaction ไม่มีการแตกยอดสุทธิรายหน่วยงานในสคีมานี้เลย —
    // ข้อจำกัดที่มีอยู่แล้วของโครงสร้างข้อมูล ไม่ใช่สิ่งที่เพิ่งเกิดจากงานนี้
    // "จำนวน" (2026-09-22) นับจาก Detail.Days ของบรรทัด "01 ค่าแรง" เท่านั้น
    // (ไม่รวมรหัสรายได้อื่น เช่น "11 โอทีเหมา") — ตรวจสอบกับข้อมูลจริงแล้วพบว่า
    // pullPayrollFromWorksheet() เซ็ต Days=1 ให้ทุกรหัสรายได้ DAILY-rate ของวัน
    // เดียวกัน (เช่น 6909001 มีทั้ง "01"=1 วัน และ "11"=1 วัน สำหรับวันทำงาน
    // เดียวกัน) ถ้ารวม Days ข้ามทุกรหัสจะนับวันทำงานเดียวกันซ้ำหลายรอบ — "01"
    // เป็นรหัสเดียวที่ Days ของมันตรงกับ "จำนวนวันทำงานจริง" ความหมายเดียว
    // ส่วนรหัสอื่น Days แค่ "สะท้อนวันเดียวกัน" ไปกับรายได้ประเภทนั้นๆ
    if (groupBy === "DEPT") {
      const groupCode = t.Employee.DeptCode ?? "-";
      const groupName = t.Employee.Department?.DeptName ?? "(ไม่ระบุแผนก)";
      const group = groupTotals.get(groupCode) ?? newGroup(groupName);
      for (const d of t.Details) {
        const key = `${d.LineType}:${d.Code}`;
        group.amounts.set(key, (group.amounts.get(key) ?? zero).add(d.Amount));
        if (d.LineType === "INCOME" && d.Code === "01" && d.Days) group.totalDays = group.totalDays.add(d.Days);
      }
      group.netPay = group.netPay.add(t.NetPay);
      group.employeeCodes.add(t.EmpCode);
      groupTotals.set(groupCode, group);
      continue;
    }

    for (const d of t.Details) {
      const groupCode = d.SiteCode ?? t.SiteCode;
      const groupName = d.Site?.SiteName ?? t.Site.SiteName;
      const group = groupTotals.get(groupCode) ?? newGroup(groupName);
      const key = `${d.LineType}:${d.Code}`;
      group.amounts.set(key, (group.amounts.get(key) ?? zero).add(d.Amount));
      if (d.LineType === "INCOME" && d.Code === "01" && d.Days) group.totalDays = group.totalDays.add(d.Days);
      group.employeeCodes.add(t.EmpCode);
      groupTotals.set(groupCode, group);
    }
    const netPayGroupCode = t.SiteCode;
    const netPayGroup = groupTotals.get(netPayGroupCode) ?? newGroup(t.Site.SiteName);
    netPayGroup.netPay = netPayGroup.netPay.add(t.NetPay);
    groupTotals.set(netPayGroupCode, netPayGroup);
  }

  const rows = [...groupTotals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([groupCode, g]) => ({
      groupCode,
      groupName: g.groupName,
      employeeCount: g.employeeCodes.size,
      totalDays: g.totalDays.toFixed(1),
      amounts: Object.fromEntries(columns.map((c) => [`${c.type}:${c.code}`, (g.amounts.get(`${c.type}:${c.code}`) ?? zero).toFixed(2)])),
      netPay: g.netPay.toFixed(2),
    }));

  const grandAmounts: Record<string, string> = {};
  let grandNetPay = zero;
  let grandDays = zero;
  const allEmployeeCodes = new Set<string>();
  for (const c of columns) {
    const key = `${c.type}:${c.code}`;
    grandAmounts[key] = rows.reduce((s, r) => s.add(r.amounts[key]), zero).toFixed(2);
  }
  for (const g of groupTotals.values()) {
    grandDays = grandDays.add(g.totalDays);
    for (const e of g.employeeCodes) allEmployeeCodes.add(e);
  }
  for (const r of rows) grandNetPay = grandNetPay.add(r.netPay);

  return {
    columns,
    rows,
    grandTotal: { employeeCount: allEmployeeCodes.size, totalDays: grandDays.toFixed(1), amounts: grandAmounts, netPay: grandNetPay.toFixed(2) },
  };
}
