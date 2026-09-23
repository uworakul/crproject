import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { LEAVE_STATUS_VALUES, LEAVE_HOURS_PER_DAY, isLeaveTypeEligible } from "@/lib/leave";
import { consumeDocumentNumber } from "@/lib/document-number";

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

// Computes TotalDays server-side — never trusts a client-supplied value.
// isFullDay=true: TotalDays = inclusive calendar days between start/end.
// isFullDay=false (hourly): single day only (endDate forced = startDate),
// TotalDays = hoursRequested / LEAVE_HOURS_PER_DAY.
function computeSpan(
  startDate: Date,
  endDateInput: Date,
  isFullDay: boolean,
  hoursRequested: number | undefined,
): { endDate: Date; totalDays: number; hoursRequested: number | null } | { error: string; message: string } {
  if (isFullDay) {
    if (endDateInput < startDate) return { error: "VALIDATION_FAILED", message: "endDate must be on or after startDate" };
    const spanDays = Math.floor((endDateInput.getTime() - startDate.getTime()) / 86400000) + 1;
    return { endDate: endDateInput, totalDays: spanDays, hoursRequested: null };
  }
  if (!Number.isFinite(hoursRequested) || hoursRequested === undefined || hoursRequested <= 0 || hoursRequested > 24) {
    return { error: "VALIDATION_FAILED", message: "hoursRequested must be a number between 0 and 24 when isFullDay is false" };
  }
  return { endDate: startDate, totalDays: hoursRequested / LEAVE_HOURS_PER_DAY, hoursRequested };
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "LEAVE_REQUEST", "save");
  if (denied) return denied;

  let body: { empCode?: unknown; leaveTypeCode?: unknown; startDate?: unknown; endDate?: unknown; isFullDay?: unknown; hoursRequested?: unknown; hasMedicalCert?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const empCode = typeof body.empCode === "string" ? body.empCode.trim() : "";
  const leaveTypeCode = typeof body.leaveTypeCode === "string" ? body.leaveTypeCode.trim() : "";
  const startDate = typeof body.startDate === "string" ? new Date(body.startDate) : new Date(NaN);
  const isFullDay = body.isFullDay !== false;
  const endDateRaw = typeof body.endDate === "string" && body.endDate ? new Date(body.endDate) : startDate;
  const hoursRequested = body.hoursRequested !== undefined ? Number(body.hoursRequested) : undefined;

  if (!empCode || !leaveTypeCode || Number.isNaN(startDate.getTime())) {
    return apiError(400, "INVALID_PARAMS", "empCode, leaveTypeCode, and startDate are required");
  }
  if (isFullDay && Number.isNaN(endDateRaw.getTime())) return apiError(400, "INVALID_PARAMS", "endDate is required when isFullDay is true");

  const span = computeSpan(startDate, endDateRaw, isFullDay, hoursRequested);
  if ("error" in span) return apiError(400, span.error, span.message);

  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND", undefined, { empCode });
  // Server-side mirror of the employee-picker dropdown's own filter
  // (EmployeeStatus="ACTIVE") — the dropdown hiding a resigned employee was
  // never actually enforced here, so a resigned EmpCode could still get a
  // brand-new leave request by calling this endpoint directly. Found via an
  // explicit negative-test request (2026-09-24).
  if (employee.EmployeeStatus !== "ACTIVE") {
    return apiError(409, "EMPLOYEE_NOT_ELIGIBLE", "This employee's status does not allow filing a new leave request", { empCode, employeeStatus: employee.EmployeeStatus });
  }

  const leaveType = await prisma.mstLeaveType.findUnique({ where: { LeaveTypeCode: leaveTypeCode } });
  if (!leaveType) return apiError(404, "LEAVE_TYPE_NOT_FOUND", undefined, { leaveTypeCode });

  if (!isLeaveTypeEligible(leaveType.EligibleEmployeeType, employee.EmployeeType)) {
    return apiError(422, "LEAVE_TYPE_NOT_ELIGIBLE", `${leaveType.LeaveTypeName} is restricted to a different employee type`, {
      leaveTypeCode,
      eligibleEmployeeType: leaveType.EligibleEmployeeType,
      employeeType: employee.EmployeeType,
    });
  }

  const documentNo = await consumeDocumentNumber("LEAVE", "ใบลา");

  const created = await prisma.trnLeaveRequest.create({
    data: {
      DocumentNo: documentNo,
      EmpCode: empCode,
      LeaveTypeCode: leaveTypeCode,
      StartDate: startDate,
      EndDate: span.endDate,
      IsFullDay: isFullDay,
      HoursRequested: span.hoursRequested,
      TotalDays: span.totalDays,
      HasMedicalCert: body.hasMedicalCert === true,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "CREATE_LEAVE_REQUEST", { targetTable: "trn_leave_request", targetId: String(created.LeaveID) });
  return apiSuccess(created, 201);
}
