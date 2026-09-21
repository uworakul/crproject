import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";
import { logAction } from "@/lib/audit-log";
import { getOrCreateSystemConfig } from "@/lib/system-config";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SYS_CONFIG", "read");
  if (denied) return denied;

  const config = await getOrCreateSystemConfig();
  return apiSuccess(config);
}

export async function PUT(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SYS_CONFIG", "save");
  if (denied) return denied;

  let body: {
    registrationCode?: unknown;
    accessKey?: unknown;
    passChecking?: unknown;
    contactPerson?: unknown;
    tel?: unknown;
    fileFolder?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  if (body.passChecking !== undefined && typeof body.passChecking !== "boolean") {
    return apiError(400, "INVALID_PARAMS", "passChecking must be a boolean");
  }
  for (const [key, value] of Object.entries(body)) {
    if (key === "passChecking") continue;
    if (value !== undefined && value !== null && typeof value !== "string") {
      return apiError(400, "INVALID_PARAMS", `${key} must be a string`);
    }
  }

  await getOrCreateSystemConfig();

  const updated = await prisma.sysConfig.update({
    where: { SysConfigID: 1 },
    data: {
      RegistrationCode: typeof body.registrationCode === "string" ? body.registrationCode || null : undefined,
      AccessKey: typeof body.accessKey === "string" ? body.accessKey || null : undefined,
      PassChecking: typeof body.passChecking === "boolean" ? body.passChecking : undefined,
      ContactPerson: typeof body.contactPerson === "string" ? body.contactPerson || null : undefined,
      Tel: typeof body.tel === "string" ? body.tel || null : undefined,
      FileFolder: typeof body.fileFolder === "string" ? body.fileFolder || null : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_SYSTEM_CONFIG", { targetTable: "sys_config", targetId: "1" });

  return apiSuccess(updated);
}
