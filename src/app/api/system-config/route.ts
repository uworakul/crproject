import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";
import { logAction } from "@/lib/audit-log";
import { getDatabaseName, getOrCreateSystemConfig, hashAccessKey, isAllowedAccessKey, storedAccessKeyIsAllowed, toClientConfig } from "@/lib/system-config";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SYS_CONFIG", "read");
  if (denied) return denied;

  const config = await getOrCreateSystemConfig();
  return apiSuccess(toClientConfig(config));
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

  const current = await getOrCreateSystemConfig();

  // "Pass Checking" is only ever true while: every text field is filled,
  // Registration Code == the real database name, and the Access Key is one of
  // the operator-held keys. Evaluated on the values as they will be after
  // this save (an omitted Access Key falls back to the stored hash), and the
  // flag is forced back to false whenever any condition stops holding.
  const nextRegistrationCode = typeof body.registrationCode === "string" ? body.registrationCode.trim() : (current.RegistrationCode ?? "");
  const nextContactPerson = typeof body.contactPerson === "string" ? body.contactPerson.trim() : (current.ContactPerson ?? "");
  const nextTel = typeof body.tel === "string" ? body.tel.trim() : (current.Tel ?? "");
  const incomingAccessKey = typeof body.accessKey === "string" ? body.accessKey : "";
  const accessKeyOk = incomingAccessKey ? isAllowedAccessKey(incomingAccessKey) : await storedAccessKeyIsAllowed(current.AccessKey);
  const passCheckingAllowed =
    nextRegistrationCode !== "" && nextContactPerson !== "" && nextTel !== "" && nextRegistrationCode === (await getDatabaseName()) && accessKeyOk;
  if (body.passChecking === true && !passCheckingAllowed) {
    return apiError(400, "PASS_CHECKING_NOT_ALLOWED", "ไม่สามารถเปิด Pass Checking ได้ — ข้อมูลไม่ครบหรือ Registration Code / Access Key ไม่ถูกต้อง");
  }

  const updated = await prisma.sysConfig.update({
    where: { SysConfigID: 1 },
    data: {
      RegistrationCode: typeof body.registrationCode === "string" ? body.registrationCode || null : undefined,
      // Blank = leave the stored key untouched (the form never receives it back). Only a bcrypt hash is stored.
      AccessKey: incomingAccessKey ? await hashAccessKey(incomingAccessKey) : undefined,
      PassChecking: passCheckingAllowed ? (typeof body.passChecking === "boolean" ? body.passChecking : undefined) : false,
      ContactPerson: typeof body.contactPerson === "string" ? body.contactPerson || null : undefined,
      Tel: typeof body.tel === "string" ? body.tel || null : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_SYSTEM_CONFIG", { targetTable: "sys_config", targetId: "1" });

  return apiSuccess(toClientConfig(updated));
}
