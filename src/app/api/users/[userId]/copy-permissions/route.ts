import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// BR-004: copy another user's whole permission set onto this one (replaces
// whatever this user had).
export async function POST(request: NextRequest, ctx: RouteContext<"/api/users/[userId]/copy-permissions">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const denied = await requirePermission(user, "USER", "save");
  if (denied) return denied;

  const { userId } = await ctx.params;

  let body: { fromUserId?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const fromUserId = typeof body.fromUserId === "string" ? body.fromUserId.trim() : "";
  if (!fromUserId) {
    return apiError(400, "INVALID_PARAMS", "fromUserId is required");
  }
  if (fromUserId === userId) {
    return apiError(400, "VALIDATION_FAILED", "fromUserId must differ from the target user");
  }

  const [target, source, sourcePermissions] = await Promise.all([
    prisma.sysUser.findUnique({ where: { UserID: userId } }),
    prisma.sysUser.findUnique({ where: { UserID: fromUserId } }),
    prisma.sysUserPermission.findMany({ where: { UserID: fromUserId } }),
  ]);

  if (!target) return apiError(404, "USER_NOT_FOUND", undefined, { userId });
  if (!source) return apiError(404, "USER_NOT_FOUND", undefined, { userId: fromUserId });

  await prisma.$transaction([
    prisma.sysUserPermission.deleteMany({ where: { UserID: userId } }),
    ...(sourcePermissions.length > 0
      ? [
          prisma.sysUserPermission.createMany({
            data: sourcePermissions.map((p) => ({
              UserID: userId,
              DocumentType: p.DocumentType,
              SiteCode: p.SiteCode,
              CanRead: p.CanRead,
              CanSave: p.CanSave,
              CanDelete: p.CanDelete,
              CanApprove: p.CanApprove,
            })),
          }),
        ]
      : []),
  ]);

  await logAction(user.userId, "COPY_PERMISSIONS", {
    targetTable: "sys_user_permission",
    targetId: userId,
    detail: `Copied from ${fromUserId}`,
  });

  return apiSuccess({ ok: true, count: sourcePermissions.length });
}
