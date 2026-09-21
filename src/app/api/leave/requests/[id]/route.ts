import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { LEAVE_HOURS_PER_DAY } from "@/lib/leave";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/leave/requests/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "LEAVE_REQUEST", "read");
  if (denied) return denied;

  const { id } = await ctx.params;
  const leaveId = Number(id);
  if (!Number.isInteger(leaveId)) return apiError(400, "INVALID_PARAMS");

  const req = await prisma.trnLeaveRequest.findUnique({
    where: { LeaveID: leaveId },
    include: { Employee: { select: { FullName: true } }, LeaveType: true },
  });
  if (!req) return apiError(404, "LEAVE_REQUEST_NOT_FOUND");
  return apiSuccess(req);
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/leave/requests/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "LEAVE_REQUEST", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const leaveId = Number(id);
  if (!Number.isInteger(leaveId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.trnLeaveRequest.findUnique({ where: { LeaveID: leaveId } });
  if (!existing) return apiError(404, "LEAVE_REQUEST_NOT_FOUND");
  if (existing.Status !== "DRAFT") {
    return apiError(409, "LEAVE_REQUEST_LOCKED", "Only a DRAFT leave request can be edited", { status: existing.Status });
  }

  let body: { startDate?: unknown; endDate?: unknown; isFullDay?: unknown; hoursRequested?: unknown; hasMedicalCert?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const startDate = typeof body.startDate === "string" && body.startDate ? new Date(body.startDate) : existing.StartDate;
  if (Number.isNaN(startDate.getTime())) return apiError(400, "VALIDATION_FAILED", "startDate is invalid");
  const isFullDay = typeof body.isFullDay === "boolean" ? body.isFullDay : existing.IsFullDay;
  const endDateInput = typeof body.endDate === "string" && body.endDate ? new Date(body.endDate) : isFullDay ? existing.EndDate : startDate;
  const hoursRequested =
    body.hoursRequested !== undefined ? Number(body.hoursRequested) : existing.HoursRequested !== null ? Number(existing.HoursRequested) : undefined;

  let endDate: Date;
  let totalDays: number;
  let hoursRequestedToStore: number | null;
  if (isFullDay) {
    if (Number.isNaN(endDateInput.getTime()) || endDateInput < startDate) {
      return apiError(400, "VALIDATION_FAILED", "endDate must be on or after startDate");
    }
    endDate = endDateInput;
    totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
    hoursRequestedToStore = null;
  } else {
    if (!Number.isFinite(hoursRequested) || hoursRequested === undefined || hoursRequested <= 0 || hoursRequested > 24) {
      return apiError(400, "VALIDATION_FAILED", "hoursRequested must be a number between 0 and 24 when isFullDay is false");
    }
    endDate = startDate;
    totalDays = hoursRequested / LEAVE_HOURS_PER_DAY;
    hoursRequestedToStore = hoursRequested;
  }

  const updated = await prisma.trnLeaveRequest.update({
    where: { LeaveID: leaveId },
    data: {
      StartDate: startDate,
      EndDate: endDate,
      IsFullDay: isFullDay,
      HoursRequested: hoursRequestedToStore,
      TotalDays: totalDays,
      HasMedicalCert: typeof body.hasMedicalCert === "boolean" ? body.hasMedicalCert : existing.HasMedicalCert,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_LEAVE_REQUEST", { targetTable: "trn_leave_request", targetId: id });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/leave/requests/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "LEAVE_REQUEST", "delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  const leaveId = Number(id);
  if (!Number.isInteger(leaveId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.trnLeaveRequest.findUnique({ where: { LeaveID: leaveId } });
  if (!existing) return apiError(404, "LEAVE_REQUEST_NOT_FOUND");
  if (existing.Status !== "DRAFT") {
    return apiError(409, "LEAVE_REQUEST_LOCKED", "Only a DRAFT leave request can be deleted", { status: existing.Status });
  }

  await prisma.trnLeaveRequest.delete({ where: { LeaveID: leaveId } });
  await logAction(user.userId, "DELETE_LEAVE_REQUEST", { targetTable: "trn_leave_request", targetId: id });
  return apiSuccess({ ok: true });
}
