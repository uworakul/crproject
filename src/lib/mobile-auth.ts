import "server-only";
import { prisma } from "./prisma";
import { apiError } from "./api-response";
import type { CurrentUser } from "./dal";

// MOBILE module (2026-10-02): Role EMPLOYEE users are self-service only —
// their sys_user.UserID IS their mst_employee.EmpCode (decision confirmed
// with the user), so "my own data" is always keyed by user.userId and no
// EmpCode is ever accepted from the client.
export const SITE_LOCATION_ROLES = ["SITE_HEAD", "ADMIN", "APPROVER"] as const;

export function canManageSiteLocation(user: CurrentUser): boolean {
  return !user.systemLocked && (SITE_LOCATION_ROLES as readonly string[]).includes(user.role);
}

/** Resolves the logged-in EMPLOYEE-role user to their mst_employee row, or an error Response to return. */
export async function requireSelfEmployee(user: CurrentUser) {
  if (user.systemLocked) return { error: apiError(403, "FORBIDDEN", "System is locked") };
  if (user.role !== "EMPLOYEE") return { error: apiError(403, "FORBIDDEN", "This screen is for Role EMPLOYEE only") };
  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: user.userId } });
  if (!employee) return { error: apiError(404, "EMPLOYEE_NOT_FOUND", "No employee record matches this user's ID (UserID must equal EmpCode)") };
  return { employee };
}
