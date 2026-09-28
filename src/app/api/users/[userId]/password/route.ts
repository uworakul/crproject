import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
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

  let body: { currentPassword?: unknown; newPassword?: unknown; confirmPassword?: unknown };
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (newPassword.length < 8) {
    return apiError(400, "VALIDATION_FAILED", "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
  }
  if (Buffer.byteLength(newPassword, "utf8") > 72) {
    return apiError(400, "VALIDATION_FAILED", "รหัสผ่านใหม่ยาวเกินไป (สูงสุด 72 ไบต์)");
  }

  const existing = await prisma.sysUser.findUnique({ where: { UserID: userId } });
  if (!existing) return apiError(404, "USER_NOT_FOUND");

  if (userId === user.userId) {
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    if (!currentPassword || !(await verifyPassword(currentPassword, existing.PasswordHash))) {
      return apiError(400, "INVALID_CURRENT_PASSWORD", "รหัสผ่านปัจจุบันไม่ถูกต้อง");
    }
    if (body.confirmPassword !== newPassword) {
      return apiError(400, "VALIDATION_FAILED", "ยืนยันรหัสผ่านใหม่ไม่ตรงกัน");
    }
    if (await verifyPassword(newPassword, existing.PasswordHash)) {
      return apiError(400, "VALIDATION_FAILED", "รหัสผ่านใหม่ต้องแตกต่างจากรหัสผ่านปัจจุบัน");
    }
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.sysUser.update({
    where: { UserID: userId },
    data: { PasswordHash: passwordHash, UpdatedBy: user.userId, UpdatedDate: new Date() },
  });

  await logAction(user.userId, "CHANGE_PASSWORD", { targetTable: "sys_user", targetId: userId });

  return apiSuccess({ ok: true });
}
