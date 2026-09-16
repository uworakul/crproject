import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { isValidRole } from "@/lib/validation";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const denied = await requirePermission(user, "USER", "read");
  if (denied) return denied;

  const users = await prisma.sysUser.findMany({
    select: {
      UserID: true,
      DisplayName: true,
      Email: true,
      Role: true,
      DefaultSiteCode: true,
      IsActive: true,
      CreatedDate: true,
      LastLoginDate: true,
    },
    orderBy: { UserID: "asc" },
  });

  return apiSuccess(users);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const denied = await requirePermission(user, "USER", "save");
  if (denied) return denied;

  let body: {
    userId?: unknown;
    password?: unknown;
    displayName?: unknown;
    email?: unknown;
    role?: unknown;
    defaultSiteCode?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;
  const defaultSiteCode =
    typeof body.defaultSiteCode === "string" && body.defaultSiteCode.trim()
      ? body.defaultSiteCode.trim()
      : null;

  if (!userId || !password || !displayName) {
    return apiError(400, "INVALID_PARAMS", "userId, password, and displayName are required");
  }
  if (!isValidRole(body.role)) {
    return apiError(400, "VALIDATION_FAILED", "role must be one of the allowed values");
  }
  if (password.length < 8) {
    return apiError(400, "VALIDATION_FAILED", "password must be at least 8 characters");
  }

  const existing = await prisma.sysUser.findUnique({ where: { UserID: userId } });
  if (existing) {
    return apiError(409, "USER_ALREADY_EXISTS", undefined, { userId });
  }

  if (defaultSiteCode) {
    const site = await prisma.mstSite.findUnique({ where: { SiteCode: defaultSiteCode } });
    if (!site) {
      return apiError(400, "VALIDATION_FAILED", "defaultSiteCode does not exist", { defaultSiteCode });
    }
  }

  const passwordHash = await hashPassword(password);

  const created = await prisma.sysUser.create({
    data: {
      UserID: userId,
      PasswordHash: passwordHash,
      DisplayName: displayName,
      Email: email,
      Role: body.role,
      DefaultSiteCode: defaultSiteCode,
    },
    select: {
      UserID: true,
      DisplayName: true,
      Email: true,
      Role: true,
      DefaultSiteCode: true,
      IsActive: true,
      CreatedDate: true,
    },
  });

  await logAction(user.userId, "CREATE_USER", { targetTable: "sys_user", targetId: userId });

  return apiSuccess(created, 201);
}
