import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/leave/tenure-tiers/[tierId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "save");
  if (denied) return denied;

  const { tierId } = await ctx.params;
  const id = Number(tierId);
  if (!Number.isInteger(id)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.mstLeaveTenureTier.findUnique({ where: { TenureTierID: id } });
  if (!existing) return apiError(404, "TENURE_TIER_NOT_FOUND");

  let body: { minYearsOfService?: unknown; entitledDays?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const minYearsOfService = body.minYearsOfService !== undefined ? Number(body.minYearsOfService) : existing.MinYearsOfService;
  const entitledDays = body.entitledDays !== undefined ? Number(body.entitledDays) : Number(existing.EntitledDays);
  if (!Number.isInteger(minYearsOfService) || minYearsOfService < 0) {
    return apiError(400, "VALIDATION_FAILED", "minYearsOfService must be a non-negative integer");
  }
  if (!Number.isFinite(entitledDays) || entitledDays < 0) return apiError(400, "VALIDATION_FAILED", "entitledDays must be a non-negative number");

  if (minYearsOfService !== existing.MinYearsOfService) {
    const clash = await prisma.mstLeaveTenureTier.findUnique({
      where: { LeaveTypeCode_MinYearsOfService: { LeaveTypeCode: existing.LeaveTypeCode, MinYearsOfService: minYearsOfService } },
    });
    if (clash) return apiError(409, "TENURE_TIER_ALREADY_EXISTS", undefined, { leaveTypeCode: existing.LeaveTypeCode, minYearsOfService });
  }

  const updated = await prisma.mstLeaveTenureTier.update({
    where: { TenureTierID: id },
    data: { MinYearsOfService: minYearsOfService, EntitledDays: entitledDays, UpdatedBy: user.userId, UpdatedDate: new Date() },
  });

  await logAction(user.userId, "UPDATE_LEAVE_TENURE_TIER", { targetTable: "mst_leave_tenure_tier", targetId: tierId });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/leave/tenure-tiers/[tierId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "delete");
  if (denied) return denied;

  const { tierId } = await ctx.params;
  const id = Number(tierId);
  if (!Number.isInteger(id)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.mstLeaveTenureTier.findUnique({ where: { TenureTierID: id } });
  if (!existing) return apiError(404, "TENURE_TIER_NOT_FOUND");

  await prisma.mstLeaveTenureTier.delete({ where: { TenureTierID: id } });
  await logAction(user.userId, "DELETE_LEAVE_TENURE_TIER", { targetTable: "mst_leave_tenure_tier", targetId: tierId });
  return apiSuccess({ ok: true });
}
