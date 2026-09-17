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

  const positions = await prisma.refPosition.findMany({ orderBy: { PositionCode: "asc" } });
  return apiSuccess(positions);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "save");
  if (denied) return denied;

  let body: { positionCode?: unknown; positionName?: unknown; positionAllowance?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const positionCode = typeof body.positionCode === "string" ? body.positionCode.trim() : "";
  const positionName = typeof body.positionName === "string" ? body.positionName.trim() : "";
  const positionAllowance = Number(body.positionAllowance ?? 0);
  if (!positionCode || !positionName) return apiError(400, "INVALID_PARAMS", "positionCode and positionName are required");
  if (!Number.isFinite(positionAllowance) || positionAllowance < 0) {
    return apiError(400, "VALIDATION_FAILED", "positionAllowance must be a non-negative number");
  }

  const existing = await prisma.refPosition.findUnique({ where: { PositionCode: positionCode } });
  if (existing) return apiError(409, "POSITION_ALREADY_EXISTS", undefined, { positionCode });

  const created = await prisma.refPosition.create({
    data: { PositionCode: positionCode, PositionName: positionName, PositionAllowance: positionAllowance },
  });
  await logAction(user.userId, "CREATE_POSITION", { targetTable: "ref_position", targetId: positionCode });
  return apiSuccess(created, 201);
}
