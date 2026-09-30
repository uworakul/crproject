import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { isAllowedAccessKey } from "@/lib/system-config";
import { createSession } from "@/lib/session";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { resolveTenant } from "@/lib/tenant-registry";
import { runWithTenantClient } from "@/lib/tenant-context";

const BOOTSTRAP_USER_IDS = ["admin", "wat"];

export async function POST(request: NextRequest) {
  let body: { userId?: unknown; password?: unknown; tenantCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const tenantCode = typeof body.tenantCode === "string" ? body.tenantCode.trim() : "";

  if (!userId || !password || !tenantCode) {
    return apiError(400, "INVALID_PARAMS", "tenantCode, userId and password are required");
  }

  const tenant = resolveTenant(tenantCode);
  if (!tenant) {
    return apiError(404, "TENANT_NOT_FOUND", "ไม่พบรหัสลูกค้านี้ในระบบ");
  }
  runWithTenantClient(tenant.client);

  let user = await prisma.sysUser.findUnique({ where: { UserID: userId } });

  // First-run bootstrap (2026-09-30): a brand-new database has no users at
  // all, so nobody could ever reach System Configuration to register it.
  // While sys_user is completely empty, "admin" or "wat" may sign in with one
  // of the operator-held Access Keys (SYSTEM_ACCESS_KEYS in .env, never in
  // source) — that creates the ADMIN account (password = the key used, change
  // it afterwards) and the session is then locked to System Configuration
  // like any other until Pass Checking passes. Any other userId, any other
  // password, or a non-empty user table gets the normal "invalid credentials".
  if (!user && BOOTSTRAP_USER_IDS.includes(userId.toLowerCase()) && isAllowedAccessKey(password) && (await prisma.sysUser.count()) === 0) {
    user = await prisma.sysUser.create({
      data: { UserID: userId.toLowerCase(), PasswordHash: await hashPassword(password), DisplayName: userId.toLowerCase(), Role: "ADMIN", CreatedBy: "SYSTEM" },
    });
    await logAction(user.UserID, "BOOTSTRAP_ADMIN", { targetTable: "sys_user", targetId: user.UserID });
  }

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

  await createSession(user.UserID, tenant.code, {
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
