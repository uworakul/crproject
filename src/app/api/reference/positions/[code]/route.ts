import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/reference/positions/[code]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "save");
  if (denied) return denied;

  const { code } = await ctx.params;
  const existing = await prisma.refPosition.findUnique({ where: { PositionCode: code } });
  if (!existing) return apiError(404, "POSITION_NOT_FOUND");

  let body: { positionName?: unknown; positionAllowance?: unknown; isActive?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  if (body.positionAllowance !== undefined) {
    const n = Number(body.positionAllowance);
    if (!Number.isFinite(n) || n < 0) return apiError(400, "VALIDATION_FAILED", "positionAllowance must be a non-negative number");
  }

  const updated = await prisma.refPosition.update({
    where: { PositionCode: code },
    data: {
      PositionName: typeof body.positionName === "string" ? body.positionName.trim() : undefined,
      PositionAllowance: body.positionAllowance !== undefined ? Number(body.positionAllowance) : undefined,
      IsActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_POSITION", { targetTable: "ref_position", targetId: code });
  return apiSuccess(updated);
}

// Hard delete — mst_employee.PositionCode has a NO ACTION FK to this table,
// which SQL Server rejects on its own the moment a position is actually
// referenced; we just surface that cleanly instead of guessing.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/reference/positions/[code]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "delete");
  if (denied) return denied;

  const { code } = await ctx.params;
  const existing = await prisma.refPosition.findUnique({ where: { PositionCode: code } });
  if (!existing) return apiError(404, "POSITION_NOT_FOUND");

  try {
    await prisma.refPosition.delete({ where: { PositionCode: code } });
  } catch {
    return apiError(409, "POSITION_IN_USE", "This position is linked to one or more employees and cannot be deleted");
  }

  await logAction(user.userId, "DELETE_POSITION", { targetTable: "ref_position", targetId: code });
  return apiSuccess({ ok: true });
}
