import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  let body: { userId?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!userId || !password) {
    return apiError(400, "INVALID_PARAMS", "userId and password are required");
  }

  const user = await prisma.sysUser.findUnique({ where: { UserID: userId } });

  if (!user) {
    return apiError(401, "INVALID_CREDENTIALS");
  }

  if (!user.IsActive) {
    return apiError(403, "ACCOUNT_DISABLED");
  }

  const passwordOk = await verifyPassword(password, user.PasswordHash);
  if (!passwordOk) {
    return apiError(401, "INVALID_CREDENTIALS");
  }

  await createSession(user.UserID, {
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  await prisma.sysUser.update({
    where: { UserID: user.UserID },
    data: { LastLoginDate: new Date() },
  });

  await logAction(user.UserID, "LOGIN", { targetTable: "sys_user", targetId: user.UserID });

  return apiSuccess({
    userId: user.UserID,
    displayName: user.DisplayName,
    role: user.Role,
    defaultSiteCode: user.DefaultSiteCode,
  });
}
