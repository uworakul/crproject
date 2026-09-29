// Shared filter shape for every report under /payroll/reports (2026-09-22).
// "ประจำงวด" collapses "ประจำเดือน"/"ประจำปี" into one field — a sys_period
// row already carries EmployeeType + Year + Month + a date range (periods
// can split a calendar month, e.g. semi-monthly 1-15/16-30), so picking a
// specific period IS picking a month+year unambiguously; a bare month+year
// wouldn't be, since a month can map to more than one period. periodId is
// required for the period-scoped reports (payslip, bank remittance,
// dept/site summary) and ignored by the ones that aren't (debt reports show
// CURRENT outstanding balances, not a snapshot of one period; the employee
// reports are a point-in-time listing).
export interface ReportFilters {
  periodId?: number;
  year?: number; // Gregorian — for the annual reports (ภงด.1ก / 50ทวิ, spans a whole calendar year) and, combined with `month`, the monthly reports (สปส 1-10 / ภงด.1, spans every sys_period in that month)
  month?: number; // 1-12, paired with `year` for the monthly reports
  companyCode?: string;
  deptCode?: string;
  siteCode?: string;
  bankCode?: string;
  employeeType?: string;
  empCode?: string;
  // ENFORCED scope (2026-09-28 permission redesign), distinct from the
  // user-chosen filters above — set by the calling route from
  // CurrentUser.allowedCompanyCodes/allowedEmployeeTypes (src/lib/dal.ts),
  // never by anything the viewer picks in a dropdown. null = unrestricted.
  allowedCompanyCodes?: string[] | null;
  allowedEmployeeTypes?: string[] | null;
}

// A sentinel that matches no real row — used when an explicit filter value
// falls outside the enforced scope, so the query returns empty rather than
// silently ignoring the scope restriction (fail closed, never a bypass).
const NONE = ["__NONE__"];

// Shared WHERE-clause fragment for mst_employee, reused by every report
// that filters on the employee dimension (all of them except the pure
// dept/site summary matrices, which filter at the transaction level
// instead since that's where SiteCode/EmpCode live for payroll rows).
export function employeeWhere(filters: ReportFilters) {
  const companyCodes = filters.allowedCompanyCodes
    ? filters.companyCode
      ? filters.allowedCompanyCodes.includes(filters.companyCode)
        ? [filters.companyCode]
        : NONE
      : filters.allowedCompanyCodes
    : filters.companyCode
      ? [filters.companyCode]
      : null;
  const employeeTypes = filters.allowedEmployeeTypes
    ? filters.employeeType
      ? filters.allowedEmployeeTypes.includes(filters.employeeType)
        ? [filters.employeeType]
        : NONE
      : filters.allowedEmployeeTypes
    : filters.employeeType
      ? [filters.employeeType]
      : null;
  return {
    ...(companyCodes ? { CompanyCode: { in: companyCodes } } : {}),
    ...(filters.deptCode ? { DeptCode: filters.deptCode } : {}),
    ...(filters.siteCode ? { DefaultSiteCode: filters.siteCode } : {}),
    ...(filters.bankCode ? { BankCode: filters.bankCode } : {}),
    ...(employeeTypes ? { EmployeeType: { in: employeeTypes } } : {}),
    ...(filters.empCode ? { EmpCode: filters.empCode } : {}),
  };
}
