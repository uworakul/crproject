import "server-only";
import { cache } from "react";
import { verifySessionRecord } from "./session";
import { runWithTenantClient } from "./tenant-context";
import { prisma } from "./prisma";

export interface CurrentUser {
  userId: string;
  role: string;
  displayName: string;
  defaultSiteCode: string | null;
  // Which tenant (tenants.json entry, e.g. "001"/"002") this session belongs
  // to — 2026-09-28, so any Route Handler can namespace shared resources
  // (e.g. Cloudflare R2 object keys, one bucket shared across all tenants)
  // by tenant without re-deriving it from the cookie itself.
  tenantCode: string;
  // Global per-user data scope (2026-09-28 permission redesign) — which
  // companies/employee-types this user is allowed to see across the WHOLE
  // app (Employee Master, Worksheet, Payroll, Leave, Requests, Inventory,
  // Dashboard/Reports), not just a single menu. `null` = unrestricted
  // (ADMIN, or zero rows in sys_user_company/sys_user_employee_type — same
  // "absence = no restriction" convention sys_user_permission.SiteCode=NULL
  // already uses). Computed once here rather than re-queried by every call
  // site — see src/lib/employee-scope.ts for how these get applied.
  allowedCompanyCodes: string[] | null;
  allowedEmployeeTypes: string[] | null;
}

/**
 * Central auth-check point. Every Route Handler, Server Component, and
 * Server Action that needs to know who's asking should call this — never
 * read the cookie directly. Memoized per-request with React's cache() so
 * multiple calls during one render/request only hit the DB once.
 */
export const verifySession = cache(async (): Promise<CurrentUser | null> => {
  const result = await verifySessionRecord();
  if (!result) return null;

  // Re-enter the tenant context HERE, in this function's own frame,
  // immediately after awaiting verifySessionRecord() — its internal DB
  // queries leave AsyncLocalStorage in a state that doesn't survive back
  // out to code that runs after it returns (a confirmed limitation of the
  // mssql driver adapter, not a generic AsyncLocalStorage issue — see
  // verifySessionRecord()'s doc comment). Re-establishing it one hop up
  // like this is enough: everything downstream (every other Route
  // Handler/Server Component/src/lib/*.ts helper) only ever CONSUMES this
  // ambient context, never re-enters it, so they're unaffected.
  runWithTenantClient(result.tenantClient);

  const { record } = result;
  const isAdmin = record.User.Role === "ADMIN";
  const [companyRows, employeeTypeRows] = isAdmin
    ? [[], []]
    : await Promise.all([
        prisma.sysUserCompany.findMany({ where: { UserID: record.User.UserID }, select: { CompanyCode: true } }),
        prisma.sysUserEmployeeType.findMany({ where: { UserID: record.User.UserID }, select: { EmployeeType: true } }),
      ]);

  return {
    userId: record.User.UserID,
    role: record.User.Role,
    displayName: record.User.DisplayName,
    defaultSiteCode: record.User.DefaultSiteCode,
    tenantCode: result.tenantCode,
    allowedCompanyCodes: isAdmin || companyRows.length === 0 ? null : companyRows.map((r) => r.CompanyCode),
    allowedEmployeeTypes: isAdmin || employeeTypeRows.length === 0 ? null : employeeTypeRows.map((r) => r.EmployeeType),
  };
});
