import "server-only";
import { prisma } from "./prisma";
import { apiError } from "./api-response";
import type { CurrentUser } from "./dal";

export type PermissionAction = "read" | "save" | "delete" | "submit" | "approve";

const ACTION_COLUMN: Record<PermissionAction, "CanRead" | "CanSave" | "CanDelete" | "CanSubmit" | "CanApprove"> = {
  read: "CanRead",
  save: "CanSave",
  delete: "CanDelete",
  // "ขออนุมัติ" (2026-09-28) — distinct from "save" now. Previously every
  // submit-for-approval route just reused CanSave; see the ~8 submit
  // routes across Worksheet/Leave/Requests/Inventory that were updated
  // alongside this to check "submit" instead.
  submit: "CanSubmit",
  approve: "CanApprove",
};

/**
 * ADMIN role bypasses all checks (BR-003). Otherwise looks up
 * sys_user_permission for (userId, documentType, siteCode) — a row with
 * SiteCode = NULL grants the permission for every site (documented design:
 * "SiteCode NULL = ทุกหน่วยงานตาม Role").
 */
export async function hasPermission(
  user: CurrentUser,
  documentType: string,
  action: PermissionAction,
  siteCode?: string | null,
): Promise<boolean> {
  if (user.role === "ADMIN") return true;

  const rows = await prisma.sysUserPermission.findMany({
    where: {
      UserID: user.userId,
      DocumentType: documentType,
      OR: [{ SiteCode: null }, { SiteCode: siteCode ?? undefined }],
    },
  });

  const column = ACTION_COLUMN[action];
  return rows.some((row) => row[column]);
}

/**
 * Guard for Route Handlers: returns an error Response to `return` immediately
 * if the user lacks the permission, or null if they're clear to proceed.
 *
 *   const denied = await requirePermission(user, "USER", "save");
 *   if (denied) return denied;
 */
export async function requirePermission(
  user: CurrentUser,
  documentType: string,
  action: PermissionAction,
  siteCode?: string | null,
) {
  const allowed = await hasPermission(user, documentType, action, siteCode);
  if (!allowed) {
    return apiError(403, "FORBIDDEN", `Missing '${action}' permission on '${documentType}'`);
  }
  return null;
}
