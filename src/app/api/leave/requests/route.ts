import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { LEAVE_STATUS_VALUES } from "@/lib/leave";

export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "LEAVE_REQUEST", "read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const empCode = searchParams.get("empCode");
  if (status && !(LEAVE_STATUS_VALUES as readonly string[]).includes(status)) {
    return apiError(400, "INVALID_PARAMS", "status must be one of " + LEAVE_STATUS_VALUES.join(", "));
  }

  const requests = await prisma.trnLeaveRequest.findMany({
    where: { ...(status ? { Status: status } : {}), ...(empCode ? { EmpCode: empCode } : {}) },
    include: { Employee: { select: { FullName: true } }, LeaveType: { select: { LeaveTypeName: true, RequireMedicalCert: true } } },
    orderBy: { CreatedDate: "desc" },
  });
  return apiSuccess(requests);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "LEAVE_REQUEST", "save");
  if (denied) return denied;

  let body: { empCode?: unknown; leaveTypeCode?: unknown; startDate?: unknown; endDate?: unknown; totalDays?: unknown; hasMedicalCert?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const empCode = typeof body.empCode === "string" ? body.empCode.trim() : "";
  const leaveTypeCode = typeof body.leaveTypeCode === "string" ? body.leaveTypeCode.trim() : "";
  const startDate = typeof body.startDate === "string" ? body.startDate : "";
  const endDate = typeof body.endDate === "string" ? body.endDate : "";
  const totalDays = Number(body.totalDays);

  if (!empCode || !leaveTypeCode || !startDate || !endDate) {
    return apiError(400, "INVALID_PARAMS", "empCode, leaveTypeCode, startDate, and endDate are required");
  }
  if (!Number.isFinite(totalDays) || totalDays <= 0) return apiError(400, "VALIDATION_FAILED", "totalDays must be a positive number");

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return apiError(400, "VALIDATION_FAILED", "endDate must be on or after startDate");
  }
  const spanDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (totalDays > spanDays) return apiError(400, "VALIDATION_FAILED", "totalDays cannot exceed the number of calendar days between startDate and endDate", { spanDays });

  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND", undefined, { empCode });

  const leaveType = await prisma.mstLeaveType.findUnique({ where: { LeaveTypeCode: leaveTypeCode } });
  if (!leaveType) return apiError(404, "LEAVE_TYPE_NOT_FOUND", undefined, { leaveTypeCode });

  const created = await prisma.trnLeaveRequest.create({
    data: {
      EmpCode: empCode,
      LeaveTypeCode: leaveTypeCode,
      StartDate: start,
      EndDate: end,
      TotalDays: totalDays,
      HasMedicalCert: body.hasMedicalCert === true,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "CREATE_LEAVE_REQUEST", { targetTable: "trn_leave_request", targetId: String(created.LeaveID) });
  return apiSuccess(created, 201);
}
