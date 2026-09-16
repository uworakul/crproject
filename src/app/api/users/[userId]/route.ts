import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { isValidRole } from "@/lib/validation";

// Next.js 16: `params` is async — must `await ctx.params`.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/users/[userId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const denied = await requirePermission(user, "USER", "read");
  if (denied) return denied;

  const { userId } = await ctx.params;

  const target = await prisma.sysUser.findUnique({
    where: { UserID: userId },
    select: {
      UserID: true,
      DisplayName: true,
      Email: true,
      Role: true,
      DefaultSiteCode: true,
      IsActive: true,
      CreatedDate: true,
      LastLoginDate: true,
      Permissions: {
        select: { PermissionID: true, DocumentType: true, SiteCode: true, CanRead: true, CanSave: true, CanDelete: true, CanApprove: true },
      },
    },
  });

  if (!target) return apiError(404, "USER_NOT_FOUND");

  return apiSuccess(target);
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/users/[userId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const denied = await requirePermission(user, "USER", "save");
  if (denied) return denied;

  const { userId } = await ctx.params;

  const existing = await prisma.sysUser.findUnique({ where: { UserID: userId } });
  if (!existing) return apiError(404, "USER_NOT_FOUND");

  let body: {
    displayName?: unknown;
    email?: unknown;
    role?: unknown;
    defaultSiteCode?: unknown;
    isActive?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  if (body.role !== undefined && !isValidRole(body.role)) {
    return apiError(400, "VALIDATION_FAILED", "role must be one of the allowed values");
  }

  const defaultSiteCode =
    body.defaultSiteCode === null
      ? null
      : typeof body.defaultSiteCode === "string" && body.defaultSiteCode.trim()
        ? body.defaultSiteCode.trim()
        : undefined;

  if (defaultSiteCode) {
    const site = await prisma.mstSite.findUnique({ where: { SiteCode: defaultSiteCode } });
    if (!site) {
      return apiError(400, "VALIDATION_FAILED", "defaultSiteCode does not exist", { defaultSiteCode });
    }
  }

  const updated = await prisma.sysUser.update({
    where: { UserID: userId },
    data: {
      DisplayName: typeof body.displayName === "string" ? body.displayName.trim() : undefined,
      Email: typeof body.email === "string" ? body.email.trim() || null : undefined,
      Role: isValidRole(body.role) ? body.role : undefined,
      DefaultSiteCode: defaultSiteCode,
      IsActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
    },
    select: {
      UserID: true,
      DisplayName: true,
      Email: true,
      Role: true,
      DefaultSiteCode: true,
      IsActive: true,
    },
  });

  await logAction(user.userId, "UPDATE_USER", { targetTable: "sys_user", targetId: userId });

  return apiSuccess(updated);
}

// Soft delete only — sys_user is referenced by nearly every table (FKs use
// NO ACTION, matching the approved DDL), so a real DELETE would violate
// referential integrity the moment the account has any history.
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/users/[userId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const denied = await requirePermission(user, "USER", "delete");
  if (denied) return denied;

  const { userId } = await ctx.params;

  if (userId === user.userId) {
    return apiError(400, "CANNOT_DEACTIVATE_SELF");
  }

  const existing = await prisma.sysUser.findUnique({ where: { UserID: userId } });
  if (!existing) return apiError(404, "USER_NOT_FOUND");

  await prisma.sysUser.update({ where: { UserID: userId }, data: { IsActive: false } });

  await logAction(user.userId, "DEACTIVATE_USER", { targetTable: "sys_user", targetId: userId });

  return apiSuccess({ ok: true });
}
