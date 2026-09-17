import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/leave/types/[code]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "save");
  if (denied) return denied;

  const { code } = await ctx.params;
  const existing = await prisma.mstLeaveType.findUnique({ where: { LeaveTypeCode: code } });
  if (!existing) return apiError(404, "LEAVE_TYPE_NOT_FOUND");

  let body: { leaveTypeName?: unknown; maxDaysPerYear?: unknown; requireMedicalCert?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const leaveTypeName = typeof body.leaveTypeName === "string" ? body.leaveTypeName.trim() : "";
  if (!leaveTypeName) return apiError(400, "INVALID_PARAMS", "leaveTypeName is required");
  const maxDaysPerYear = Number(body.maxDaysPerYear);
  if (!Number.isInteger(maxDaysPerYear) || maxDaysPerYear < 0) return apiError(400, "VALIDATION_FAILED", "maxDaysPerYear must be a non-negative integer");

  const updated = await prisma.mstLeaveType.update({
    where: { LeaveTypeCode: code },
    data: {
      LeaveTypeName: leaveTypeName,
      MaxDaysPerYear: maxDaysPerYear,
      RequireMedicalCert: body.requireMedicalCert === true,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_LEAVE_TYPE", { targetTable: "mst_leave_type", targetId: code });
  return apiSuccess(updated);
}

// Hard delete — mst_leave_type has no IsActive flag in the DDL. Blocked by
// trn_leave_request/mst_employee_leave_balance's NO ACTION FKs the moment
// the type has actually been used, surfaced cleanly rather than guessed at.
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/leave/types/[code]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "delete");
  if (denied) return denied;

  const { code } = await ctx.params;
  const existing = await prisma.mstLeaveType.findUnique({ where: { LeaveTypeCode: code } });
  if (!existing) return apiError(404, "LEAVE_TYPE_NOT_FOUND");

  try {
    await prisma.mstLeaveType.delete({ where: { LeaveTypeCode: code } });
  } catch {
    return apiError(409, "LEAVE_TYPE_IN_USE", "This leave type has requests or balances linked to it and cannot be deleted");
  }

  await logAction(user.userId, "DELETE_LEAVE_TYPE", { targetTable: "mst_leave_type", targetId: code });
  return apiSuccess({ ok: true });
}
