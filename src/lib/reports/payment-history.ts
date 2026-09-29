import "server-only";
import { prisma } from "@/lib/prisma";
import { employeeWhere, type ReportFilters } from "./types";
import type { GroupableRow } from "./group-sort";

// "กรณีเงินเบิกให้รวมเป็นชุดเดียวกัน" (2026-09-29) — 13/14/15 (เงินเบิก
// ล่วงหน้า/พนักงานใหม่/ฉุกเฉิน) collapse into one filter option and one
// displayed category, matching the same grouping DEBT_REPORT_CATEGORIES.
// ADVANCE already uses on /payroll/reports. Every other IsInstallment
// ref_deduction_type code (06,07,08,09,10,11,12,16,17,18 — whatever exists,
// not hardcoded) appears individually under its own real name.
export const ADVANCE_GROUP_CODES = ["13", "14", "15"];
const ADVANCE_GROUP_VALUE = "ADVANCE_GROUP";
const ADVANCE_GROUP_LABEL = "เงินเบิกล่วงหน้า (รวมทุกประเภท)";

export interface PaymentHistoryDebtTypeOption {
  value: string; // ADVANCE_GROUP_VALUE, or a single ref_deduction_type.DeductionCode
  label: string;
}

export async function getPaymentHistoryDebtTypeOptions(): Promise<PaymentHistoryDebtTypeOption[]> {
  const types = await prisma.refDeductionType.findMany({ where: { IsInstallment: true }, orderBy: { DeductionCode: "asc" } });
  const options: PaymentHistoryDebtTypeOption[] = [{ value: ADVANCE_GROUP_VALUE, label: ADVANCE_GROUP_LABEL }];
  for (const t of types) {
    if (ADVANCE_GROUP_CODES.includes(t.DeductionCode)) continue;
    options.push({ value: t.DeductionCode, label: t.DeductionName });
  }
  return options;
}

function resolveDebtTypeFilter(debtType: string | undefined): string[] | null {
  if (!debtType) return null;
  if (debtType === ADVANCE_GROUP_VALUE) return ADVANCE_GROUP_CODES;
  return [debtType];
}

export interface PaymentHistoryRow extends GroupableRow {
  debtTypeLabel: string;
  paymentDate: string;
  amount: string;
  remainingAfter: string;
  source: string;
  sourceLabel: string;
}

const SOURCE_LABELS: Record<string, string> = {
  INVENTORY_RETURN: "คืนสินค้า",
  MANUAL_EDIT: "แก้ไขโดยผู้ใช้งาน",
};

// One row per actual payment EVENT (from inv_employee_debt_payment — see
// its schema comment for why this table exists and what writes to it), not
// a snapshot of current debt balances. debtType (from the filter dropdown
// built by getPaymentHistoryDebtTypeOptions above) narrows to one category;
// omitted shows every category together.
export async function getPaymentHistoryRows(filters: ReportFilters, debtType?: string): Promise<PaymentHistoryRow[]> {
  const codes = resolveDebtTypeFilter(debtType);
  const payments = await prisma.invEmployeeDebtPayment.findMany({
    where: {
      Debt: {
        Employee: employeeWhere(filters),
        ...(codes ? { DeductionCode: { in: codes } } : {}),
      },
    },
    include: {
      Debt: {
        include: {
          Employee: { include: { Department: true, Site: true, Bank: true } },
          DeductionType: { select: { DeductionName: true } },
        },
      },
    },
    orderBy: { PaymentDate: "desc" },
  });

  return payments.map((p) => ({
    empCode: p.Debt.EmpCode,
    fullName: p.Debt.Employee.FullName,
    deptCode: p.Debt.Employee.DeptCode,
    deptName: p.Debt.Employee.Department?.DeptName ?? null,
    siteCode: p.Debt.Employee.DefaultSiteCode,
    siteName: p.Debt.Employee.Site?.SiteName ?? null,
    bankCode: p.Debt.Employee.BankCode,
    bankName: p.Debt.Employee.Bank?.BankNameTH ?? null,
    employeeType: p.Debt.Employee.EmployeeType,
    debtTypeLabel: p.Debt.DeductionCode && ADVANCE_GROUP_CODES.includes(p.Debt.DeductionCode) ? ADVANCE_GROUP_LABEL : (p.Debt.DeductionType?.DeductionName ?? p.Debt.DeductionCode ?? "-"),
    paymentDate: p.PaymentDate.toLocaleDateString("th-TH"),
    amount: p.Amount.toFixed(2),
    remainingAfter: p.RemainingAfter.toFixed(2),
    source: p.Source,
    sourceLabel: SOURCE_LABELS[p.Source] ?? p.Source,
  }));
}
