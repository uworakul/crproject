import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "read");
  if (denied) return denied;

  const rows = await prisma.refBlackList.findMany({ orderBy: { AddedDate: "desc" } });
  return apiSuccess(rows);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "save");
  if (denied) return denied;

  let body: { idCardNo?: unknown; fullName?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const idCardNo = typeof body.idCardNo === "string" ? body.idCardNo.trim() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
  if (!idCardNo || !fullName) return apiError(400, "INVALID_PARAMS", "idCardNo and fullName are required");

  const created = await prisma.refBlackList.create({ data: { IDCardNo: idCardNo, FullName: fullName, Reason: reason } });
  await logAction(user.userId, "CREATE_BLACKLIST", { targetTable: "ref_black_list", targetId: String(created.BlackListID) });
  return apiSuccess(created, 201);
}
