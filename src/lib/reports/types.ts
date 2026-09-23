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
}

// Shared WHERE-clause fragment for mst_employee, reused by every report
// that filters on the employee dimension (all of them except the pure
// dept/site summary matrices, which filter at the transaction level
// instead since that's where SiteCode/EmpCode live for payroll rows).
export function employeeWhere(filters: ReportFilters) {
  return {
    ...(filters.companyCode ? { CompanyCode: filters.companyCode } : {}),
    ...(filters.deptCode ? { DeptCode: filters.deptCode } : {}),
    ...(filters.siteCode ? { DefaultSiteCode: filters.siteCode } : {}),
    ...(filters.bankCode ? { BankCode: filters.bankCode } : {}),
    ...(filters.employeeType ? { EmployeeType: filters.employeeType } : {}),
    ...(filters.empCode ? { EmpCode: filters.empCode } : {}),
  };
}
