import "server-only";
import { prisma } from "@/lib/prisma";
import { employeeWhere, type ReportFilters } from "./types";
import type { GroupableRow } from "./group-sort";

// Until 2026-09-29, ref_deduction_type had two overlapping code sets for the
// same debt categories — legacy numeric codes seeded from an early Excel
// import (06-18) and newer text codes the Request & Approve / Inventory
// modules auto-provisioned on demand (ADVANCE/ADVANCEN/ADVANCEU/LOAN/
// TRAINING/UNIFORM), each of these 4 reports merging both sets so a debt
// created through either path would show up. That duplication is now fixed
// at the source (see REQUEST_DOCUMENT_DEDUCTION_CODE in src/lib/request.ts
// and the matching fix in the Inventory Issue-approve route) — every debt
// gets written under the numeric code only, and the 13 pre-existing rows
// that had accumulated under the text codes were migrated. Codes lists below
// only need the numeric side now. "ค่าชุด" (now exclusively "08") is
// deliberately NOT included here — it's grouped with the Inventory reports
// batch instead (the original request lists "หนี้ค้างค่าชุด" under the
// stock-report group, not this one), matching how the user's own list was
// organized.
export const DEBT_REPORT_CATEGORIES = {
  ADVANCE: { label: "รายงานหนี้ค้างเงินเบิกต่างๆ", codes: ["13", "14", "15"] },
  TRAINING: { label: "รายงานหนี้ค้างค่าอบรม", codes: ["10"] },
  INSURANCE: { label: "รายงานหนี้ค้างเงินประกัน", codes: ["09"] },
  LOAN: { label: "รายงานหนี้ค้างเงินกู้", codes: ["12"] },
  // Listed under the Inventory reports menu (/inventory/reports), not the payroll one.
  UNIFORM: { label: "รายงานหนี้ค้างค่าชุด", codes: ["08"] },
} as const;

export type DebtReportKey = keyof typeof DEBT_REPORT_CATEGORIES;

export interface DebtReportRow extends GroupableRow {
  deductionName: string;
  documentNo: string | null;
  documentDate: string | null;
  approvedDate: string | null;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  deductPerPeriod: string | null;
}

// Current outstanding balance, not a snapshot of one payroll period —
// inv_employee_debt.RemainingAmount is a live figure that only moves when
// approved on the Request & Approve / Inventory side, so periodId isn't a
// meaningful filter here (a debt approved 3 periods ago can still be open
// today). Only OPEN rows (RemainingAmount > 0) are worth reporting.
export async function getDebtRows(key: DebtReportKey, filters: ReportFilters): Promise<DebtReportRow[]> {
  const codes = DEBT_REPORT_CATEGORIES[key].codes;
  const debts = await prisma.invEmployeeDebt.findMany({
    where: {
      DeductionCode: { in: [...codes] },
      RemainingAmount: { gt: 0 },
      Employee: employeeWhere(filters),
    },
    include: {
      Employee: { include: { Department: true, Site: true, Bank: true } },
      RequestHeader: { select: { DocumentNo: true, RequestDate: true, ApprovedDate: true } },
    },
    orderBy: { EmpCode: "asc" },
  });

  return debts.map((d) => ({
    empCode: d.EmpCode,
    fullName: d.Employee.FullName,
    deptCode: d.Employee.DeptCode,
    deptName: d.Employee.Department?.DeptName ?? null,
    siteCode: d.Employee.DefaultSiteCode,
    siteName: d.Employee.Site?.SiteName ?? null,
    bankCode: d.Employee.BankCode,
    bankName: d.Employee.Bank?.BankNameTH ?? null,
    employeeType: d.Employee.EmployeeType,
    deductionName: d.Description ?? DEBT_REPORT_CATEGORIES[key].label,
    documentNo: d.RequestHeader?.DocumentNo ?? null,
    documentDate: d.RequestHeader?.RequestDate.toLocaleDateString("th-TH") ?? null,
    approvedDate: d.RequestHeader?.ApprovedDate?.toLocaleDateString("th-TH") ?? null,
    totalAmount: d.TotalAmount.toFixed(2),
    paidAmount: d.PaidAmount.toFixed(2),
    remainingAmount: d.RemainingAmount.toFixed(2),
    deductPerPeriod: d.DeductPerPeriod?.toFixed(2) ?? null,
  }));
}
