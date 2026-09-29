import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import type { CurrentUser } from "./dal";

// Global employee data-scope enforcement (2026-09-28 permission redesign).
// `CurrentUser.allowedCompanyCodes`/`allowedEmployeeTypes` (src/lib/dal.ts)
// are `null` when the user is unrestricted (ADMIN, or zero rows in
// sys_user_company/sys_user_employee_type) — every helper here treats
// `null` as "no filter", so it's always safe to apply unconditionally.

// Spread into any `where` clause on mst_employee directly, or as the value
// of a relation key that points at it (e.g. `Employee: employeeScopeWhere(user)`
// on trn_payroll_transaction/trn_worksheet_detail/etc.) — Prisma relation
// filters use the same shape as the related model's own WhereInput.
export function employeeScopeWhere(user: CurrentUser): Prisma.MstEmployeeWhereInput {
  return {
    ...(user.allowedCompanyCodes ? { CompanyCode: { in: user.allowedCompanyCodes } } : {}),
    ...(user.allowedEmployeeTypes ? { EmployeeType: { in: user.allowedEmployeeTypes } } : {}),
  };
}

// Same idea for a "บริษัท" filter DROPDOWN (not the ref_company reference
// screen itself, which manages the company records and stays unscoped) —
// the user's own "companies that can be selected for use" checklist should
// narrow which options even show up, not just what happens after picking
// one. Spread into ref_company `where` clauses used to populate a filter.
export function companyScopeWhere(user: CurrentUser): Prisma.RefCompanyWhereInput {
  return user.allowedCompanyCodes ? { CompanyCode: { in: user.allowedCompanyCodes } } : {};
}

// For a single already-loaded employee (load-then-mutate routes: quota,
// resign, photo, history, etc.) — a query-level `where` can't help here
// since the record is fetched by EmpCode alone, so this is the write-time
// gate. An employee with no CompanyCode at all is treated as OUT of scope
// the moment the user has any company restriction (fail closed — an unset
// company shouldn't leak through a restriction meant to hide other
// companies' people).
export function isEmployeeInScope(user: CurrentUser, employee: { CompanyCode: string | null; EmployeeType: string }): boolean {
  if (user.allowedCompanyCodes && (!employee.CompanyCode || !user.allowedCompanyCodes.includes(employee.CompanyCode))) return false;
  if (user.allowedEmployeeTypes && !user.allowedEmployeeTypes.includes(employee.EmployeeType)) return false;
  return true;
}
