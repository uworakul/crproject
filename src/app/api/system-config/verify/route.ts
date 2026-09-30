import { NextRequest } from "next/server";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getDatabaseName, isAllowedAccessKey } from "@/lib/system-config";

// Lets the System Configuration form decide whether to reveal the "Pass
// Checking" checkbox without ever shipping the accepted keys (or the database
// name) to the browser — it only learns valid: true/false.
export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SYS_CONFIG", "save");
  if (denied) return denied;

  let body: { registrationCode?: unknown; accessKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }
  const registrationCode = typeof body.registrationCode === "string" ? body.registrationCode.trim() : "";
  const accessKey = typeof body.accessKey === "string" ? body.accessKey : "";

  const databaseName = await getDatabaseName();
  const valid = registrationCode !== "" && registrationCode === databaseName && accessKey !== "" && isAllowedAccessKey(accessKey);
  return apiSuccess({ valid });
}
