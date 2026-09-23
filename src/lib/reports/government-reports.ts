import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "../../../generated/prisma/client";
import { employeeWhere, type ReportFilters } from "./types";
import type { GroupableRow } from "./group-sort";

// 2026-09-23 — "หน่วยงานภาครัฐ" report group (สปส 1-10 / ภงด.1 / ภงด.1ก /
// 50ทวิ / สรุปยอดสงเคราะห์พนักงาน). Per the user's own decision when this
// batch was scoped out earlier (see CLAUDE.md, Payroll reports section):
// these are DATA-TABLE reports, not pixel-exact reproductions of the actual
// government forms — same "รายงานตารางข้อมูล" choice already applied to
// every other report under /payroll/reports.
//
// Employer-side SSO/welfare-fund contributions are NOT stored anywhere —
// only the employee's own share is persisted on trn_payroll_transaction
// (SSOAmount/WelfareFundAmount, written by Calculate). These two reports
// need the employer's share too (that's the whole point of a remittance
// report), so it's recomputed here from the period's ref_sso_base/
// ref_welfare_fund row using the same base+rate shape as
// calculateSso()/calculateWelfareFund() in src/lib/payroll.ts, just with
// EmployerRate instead of EmployeeRate. If that year's rate row no longer
// exists (e.g. deleted after the period was calculated), the employer share
// is reported as null ("-") rather than throwing — a report should still
// render what it has, unlike the Calculate flow itself which fails loud.
function periodTransactionWhere(periodId: number, filters: ReportFilters) {
  return { PeriodID: periodId, Employee: employeeWhere(filters) };
}

const employeeGroupInclude = { Department: true, Site: true, Bank: true } as const;
interface EmployeeGroupFields {
  Department: { DeptName: string } | null;
  Site: { SiteName: string } | null;
  Bank: { BankNameTH: string } | null;
  DeptCode: string | null;
  DefaultSiteCode: string | null;
  BankCode: string | null;
  EmployeeType: string;
}
function groupFieldsOf(e: EmployeeGroupFields): Pick<GroupableRow, "deptCode" | "deptName" | "siteCode" | "siteName" | "bankCode" | "bankName" | "employeeType"> {
  return {
    deptCode: e.DeptCode,
    deptName: e.Department?.DeptName ?? null,
    siteCode: e.DefaultSiteCode,
    siteName: e.Site?.SiteName ?? null,
    bankCode: e.BankCode,
    bankName: e.Bank?.BankNameTH ?? null,
    employeeType: e.EmployeeType,
  };
}

export interface ContributionRemitRow extends GroupableRow {
  idCardNo: string;
  wageBase: string;
  employeeAmount: string;
  employerAmount: string | null;
  totalAmount: string | null;
}

export async function getSsoRemitRows(periodId: number, filters: ReportFilters): Promise<ContributionRemitRow[]> {
  const period = await prisma.sysPeriod.findUniqueOrThrow({ where: { PeriodID: periodId } });
  const rate = await prisma.refSsoBase.findFirst({ where: { EffectiveYear: period.PeriodYear } });

  const transactions = await prisma.trnPayrollTransaction.findMany({
    where: { ...periodTransactionWhere(periodId, filters), SSOAmount: { gt: 0 } },
    include: { Employee: { include: employeeGroupInclude } },
    orderBy: { EmpCode: "asc" },
  });

  return transactions.map((t) => {
    const wageBase = rate ? Prisma.Decimal.max(rate.MinBase, Prisma.Decimal.min(t.GrossWage, rate.MaxBase)) : t.GrossWage;
    const employerAmount = rate ? wageBase.mul(rate.EmployerRate).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP) : null;
    return {
      empCode: t.EmpCode,
      idCardNo: t.Employee.IDCardNo,
      fullName: t.Employee.FullName,
      ...groupFieldsOf(t.Employee),
      wageBase: wageBase.toFixed(2),
      employeeAmount: t.SSOAmount.toFixed(2),
      employerAmount: employerAmount ? employerAmount.toFixed(2) : null,
      totalAmount: employerAmount ? t.SSOAmount.add(employerAmount).toFixed(2) : null,
    };
  });
}

// Merges the same employee's rows across several periods' worth of
// getSsoRemitRows()/getWelfareFundRemitRows() output into one row per
// employee — used by the monthly SSO report (a calendar month can be more
// than one sys_period for a semi-monthly DAILY payroll, e.g. 1-15/16-30,
// but SSO/welfare-fund remittance to the government is always monthly).
// Per the user's explicit choice (2026-09-23): sum each period's own
// already-computed employee/employer contribution rather than re-deriving
// a single monthly wage base and re-clamping it once — simpler, and matches
// what Payroll Calculate actually withheld each period.
function mergeContributionRows(perPeriodRows: ContributionRemitRow[][]): ContributionRemitRow[] {
  interface Acc extends Omit<ContributionRemitRow, "wageBase" | "employeeAmount" | "employerAmount" | "totalAmount"> {
    wageBase: Prisma.Decimal;
    employeeAmount: Prisma.Decimal;
    employerAmount: Prisma.Decimal | null;
    everMissingRate: boolean;
  }
  const byEmp = new Map<string, Acc>();
  for (const rows of perPeriodRows) {
    for (const r of rows) {
      const employerDec = r.employerAmount !== null ? new Prisma.Decimal(r.employerAmount) : null;
      const existing = byEmp.get(r.empCode);
      if (!existing) {
        byEmp.set(r.empCode, { ...r, wageBase: new Prisma.Decimal(r.wageBase), employeeAmount: new Prisma.Decimal(r.employeeAmount), employerAmount: employerDec, everMissingRate: employerDec === null });
        continue;
      }
      existing.wageBase = existing.wageBase.add(r.wageBase);
      existing.employeeAmount = existing.employeeAmount.add(r.employeeAmount);
      if (employerDec === null) existing.everMissingRate = true;
      else existing.employerAmount = (existing.employerAmount ?? new Prisma.Decimal(0)).add(employerDec);
    }
  }
  return [...byEmp.values()]
    .sort((a, b) => a.empCode.localeCompare(b.empCode))
    .map((acc) => ({
      empCode: acc.empCode,
      idCardNo: acc.idCardNo,
      fullName: acc.fullName,
      deptCode: acc.deptCode,
      deptName: acc.deptName,
      siteCode: acc.siteCode,
      siteName: acc.siteName,
      bankCode: acc.bankCode,
      bankName: acc.bankName,
      employeeType: acc.employeeType,
      wageBase: acc.wageBase.toFixed(2),
      employeeAmount: acc.employeeAmount.toFixed(2),
      employerAmount: acc.everMissingRate || acc.employerAmount === null ? null : acc.employerAmount.toFixed(2),
      totalAmount: acc.everMissingRate || acc.employerAmount === null ? null : acc.employeeAmount.add(acc.employerAmount).toFixed(2),
    }));
}

// รายงาน สปส 1-10 — the actual monthly remittance (2026-09-23, replacing
// the old period-scoped behavior, which moved to getSsoRemitCheckRows()
// below as "สปส 1-10 (ตรวจสอบ)"). SSO is a MONTHLY government submission
// even when payroll itself runs semi-monthly, so this sums every matching
// sys_period's worth of getSsoRemitRows() for the given (year, month).
export async function getSsoRemitMonthlyRows(year: number, month: number, filters: ReportFilters): Promise<ContributionRemitRow[]> {
  const periods = await prisma.sysPeriod.findMany({ where: { PeriodYear: year, PeriodMonth: month } });
  const perPeriodRows = await Promise.all(periods.map((p) => getSsoRemitRows(p.PeriodID, filters)));
  return mergeContributionRows(perPeriodRows);
}

// สปส 1-10 (ตรวจสอบ) — the original period-scoped breakdown, kept for
// reconciling one payroll run's actual deduction against a payslip, as
// distinct from the monthly government-submission figure above.
export const getSsoRemitCheckRows = getSsoRemitRows;

export async function getWelfareFundRemitRows(periodId: number, filters: ReportFilters): Promise<ContributionRemitRow[]> {
  const period = await prisma.sysPeriod.findUniqueOrThrow({ where: { PeriodID: periodId } });
  const rate = await prisma.refWelfareFund.findFirst({ where: { EffectiveYear: period.PeriodYear } });

  const transactions = await prisma.trnPayrollTransaction.findMany({
    where: { ...periodTransactionWhere(periodId, filters), WelfareFundAmount: { gt: 0 } },
    include: { Employee: { include: employeeGroupInclude } },
    orderBy: { EmpCode: "asc" },
  });

  return transactions.map((t) => {
    const employerAmount = rate ? t.GrossWage.mul(rate.EmployerRate).toDecimalPlaces(2) : null;
    return {
      empCode: t.EmpCode,
      idCardNo: t.Employee.IDCardNo,
      fullName: t.Employee.FullName,
      ...groupFieldsOf(t.Employee),
      wageBase: t.GrossWage.toFixed(2),
      employeeAmount: t.WelfareFundAmount.toFixed(2),
      employerAmount: employerAmount ? employerAmount.toFixed(2) : null,
      totalAmount: employerAmount ? t.WelfareFundAmount.add(employerAmount).toFixed(2) : null,
    };
  });
}

export interface WithholdingTaxRow extends GroupableRow {
  idCardNo: string;
  income: string;
  taxWithheld: string;
}

// ภงด.1 — one payroll period's withholding. "เงินได้" here is the same
// total-income shape used everywhere else in this module (GrossWage + OT +
// PositionAllowance + ShiftAllowance + OtherIncome, the derived sum of this
// transaction's INCOME detail lines) — not just GrossWage alone, since OT/
// allowances/other income are also assessable.
async function getWithholdingTaxRowsForPeriod(periodId: number, filters: ReportFilters): Promise<WithholdingTaxRow[]> {
  const transactions = await prisma.trnPayrollTransaction.findMany({
    where: { ...periodTransactionWhere(periodId, filters), TaxWithheld: { gt: 0 } },
    include: { Employee: { include: employeeGroupInclude } },
    orderBy: { EmpCode: "asc" },
  });
  return transactions.map((t) => ({
    empCode: t.EmpCode,
    idCardNo: t.Employee.IDCardNo,
    fullName: t.Employee.FullName,
    ...groupFieldsOf(t.Employee),
    income: t.GrossWage.add(t.OTAmount).add(t.PositionAllowance).add(t.ShiftAllowance).add(t.OtherIncome).toFixed(2),
    taxWithheld: t.TaxWithheld.toFixed(2),
  }));
}

// ภงด.1 is filed MONTHLY (2026-09-23, replacing the old period-scoped
// version — same reasoning as สปส 1-10 above: a semi-monthly DAILY payroll
// still owes one monthly withholding filing, not one per half-month
// period). Sums income/tax across every sys_period in the given (year,
// month) per employee.
export async function getWithholdingTaxRows(year: number, month: number, filters: ReportFilters): Promise<WithholdingTaxRow[]> {
  const periods = await prisma.sysPeriod.findMany({ where: { PeriodYear: year, PeriodMonth: month } });
  const perPeriodRows = await Promise.all(periods.map((p) => getWithholdingTaxRowsForPeriod(p.PeriodID, filters)));

  interface Acc extends Omit<WithholdingTaxRow, "income" | "taxWithheld"> {
    income: Prisma.Decimal;
    taxWithheld: Prisma.Decimal;
  }
  const byEmp = new Map<string, Acc>();
  for (const rows of perPeriodRows) {
    for (const r of rows) {
      const existing = byEmp.get(r.empCode);
      if (!existing) {
        byEmp.set(r.empCode, { ...r, income: new Prisma.Decimal(r.income), taxWithheld: new Prisma.Decimal(r.taxWithheld) });
        continue;
      }
      existing.income = existing.income.add(r.income);
      existing.taxWithheld = existing.taxWithheld.add(r.taxWithheld);
    }
  }
  return [...byEmp.values()]
    .sort((a, b) => a.empCode.localeCompare(b.empCode))
    .map((acc) => ({ ...acc, income: acc.income.toFixed(2), taxWithheld: acc.taxWithheld.toFixed(2) }));
}

export interface AnnualTaxSummaryRow extends GroupableRow {
  idCardNo: string;
  address: string | null;
  totalIncome: string;
  totalTaxWithheld: string;
}

// ภงด.1 ก / หนังสือรับรองการหักภาษี 50ทวิ — both are per-employee annual
// summaries for a calendar year (ภงด.1ก reports the totals; 50ทวิ is the
// per-employee certificate of the same totals, so the underlying data is
// identical — the route just picks whether to include the address column).
// A "year" filter, not periodId, since this deliberately spans every period
// that falls in that calendar year (sys_period.PeriodYear is already
// Gregorian in the DB — see CLAUDE.md's ปี พ.ศ./ค.ศ. note).
export async function getAnnualTaxSummaryRows(year: number, filters: ReportFilters): Promise<AnnualTaxSummaryRow[]> {
  const transactions = await prisma.trnPayrollTransaction.findMany({
    where: { Period: { PeriodYear: year }, Employee: employeeWhere(filters) },
    include: { Employee: { include: employeeGroupInclude } },
  });

  interface Acc {
    idCardNo: string;
    fullName: string;
    address: string | null;
    groupFields: ReturnType<typeof groupFieldsOf>;
    totalIncome: Prisma.Decimal;
    totalTaxWithheld: Prisma.Decimal;
  }
  const byEmployee = new Map<string, Acc>();
  for (const t of transactions) {
    const income = t.GrossWage.add(t.OTAmount).add(t.PositionAllowance).add(t.ShiftAllowance).add(t.OtherIncome);
    const existing = byEmployee.get(t.EmpCode);
    if (existing) {
      existing.totalIncome = existing.totalIncome.add(income);
      existing.totalTaxWithheld = existing.totalTaxWithheld.add(t.TaxWithheld);
      continue;
    }
    byEmployee.set(t.EmpCode, {
      idCardNo: t.Employee.IDCardNo,
      fullName: t.Employee.FullName,
      address: t.Employee.IDCardAddress ?? t.Employee.Address,
      groupFields: groupFieldsOf(t.Employee),
      totalIncome: income,
      totalTaxWithheld: t.TaxWithheld,
    });
  }

  return [...byEmployee.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([empCode, acc]) => ({
      empCode,
      idCardNo: acc.idCardNo,
      fullName: acc.fullName,
      address: acc.address,
      ...acc.groupFields,
      totalIncome: acc.totalIncome.toFixed(2),
      totalTaxWithheld: acc.totalTaxWithheld.toFixed(2),
    }));
}
