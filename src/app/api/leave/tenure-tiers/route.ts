import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Flat endpoint (not nested under /api/leave/types/[code]/...) — same
// precaution taken for every "detail row of a parent" endpoint since the
// Next.js 16.3.5 typed-routes generator bug found 2026-09-20 (see CLAUDE.md,
// Inventory stock-count module): TenureTierID is a globally-unique
// auto-increment PK, so no header ID needs to be in the URL at all.
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const leaveTypeCode = searchParams.get("leaveTypeCode");
  if (!leaveTypeCode) return apiError(400, "INVALID_PARAMS", "leaveTypeCode is required");

  const tiers = await prisma.mstLeaveTenureTier.findMany({ where: { LeaveTypeCode: leaveTypeCode }, orderBy: { MinYearsOfService: "asc" } });
  return apiSuccess(tiers);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "save");
  if (denied) return denied;

  let body: { leaveTypeCode?: unknown; minYearsOfService?: unknown; entitledDays?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const leaveTypeCode = typeof body.leaveTypeCode === "string" ? body.leaveTypeCode.trim() : "";
  const minYearsOfService = Number(body.minYearsOfService);
  const entitledDays = Number(body.entitledDays);
  if (!leaveTypeCode) return apiError(400, "INVALID_PARAMS", "leaveTypeCode is required");
  if (!Number.isInteger(minYearsOfService) || minYearsOfService < 0) {
    return apiError(400, "VALIDATION_FAILED", "minYearsOfService must be a non-negative integer");
  }
  if (!Number.isFinite(entitledDays) || entitledDays < 0) return apiError(400, "VALIDATION_FAILED", "entitledDays must be a non-negative number");

  const leaveType = await prisma.mstLeaveType.findUnique({ where: { LeaveTypeCode: leaveTypeCode } });
  if (!leaveType) return apiError(404, "LEAVE_TYPE_NOT_FOUND", undefined, { leaveTypeCode });

  const existing = await prisma.mstLeaveTenureTier.findUnique({
    where: { LeaveTypeCode_MinYearsOfService: { LeaveTypeCode: leaveTypeCode, MinYearsOfService: minYearsOfService } },
  });
  if (existing) return apiError(409, "TENURE_TIER_ALREADY_EXISTS", undefined, { leaveTypeCode, minYearsOfService });

  const created = await prisma.mstLeaveTenureTier.create({
    data: { LeaveTypeCode: leaveTypeCode, MinYearsOfService: minYearsOfService, EntitledDays: entitledDays, CreatedBy: user.userId },
  });

  await logAction(user.userId, "CREATE_LEAVE_TENURE_TIER", { targetTable: "mst_leave_tenure_tier", targetId: String(created.TenureTierID) });
  return apiSuccess(created, 201);
}
