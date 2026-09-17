import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/users/[userId]/password">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { userId } = await ctx.params;

  // Self-service password change needs no extra permission; changing
  // someone else's requires SAVE on USER.
  if (userId !== user.userId) {
    const allowed = await hasPermission(user, "USER", "save");
    if (!allowed) return apiError(403, "FORBIDDEN", "Missing 'save' permission on 'USER'");
  }

  let body: { newPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (newPassword.length < 8) {
    return apiError(400, "VALIDATION_FAILED", "newPassword must be at least 8 characters");
  }

  const existing = await prisma.sysUser.findUnique({ where: { UserID: userId } });
  if (!existing) return apiError(404, "USER_NOT_FOUND");

  const passwordHash = await hashPassword(newPassword);
  await prisma.sysUser.update({
    where: { UserID: userId },
    data: { PasswordHash: passwordHash, UpdatedBy: user.userId, UpdatedDate: new Date() },
  });

  await logAction(user.userId, "CHANGE_PASSWORD", { targetTable: "sys_user", targetId: userId });

  return apiSuccess({ ok: true });
}
