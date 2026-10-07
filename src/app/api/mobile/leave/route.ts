import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireSelfEmployee } from "@/lib/mobile-auth";
import { isLeaveTypeEligible, computeSpan } from "@/lib/leave";
import { consumeDocumentNumber } from "@/lib/document-number";
import { getMobileLeaveData } from "@/lib/mobile-leave";

// GET ?year=YYYY (Gregorian, default = current year): the employee's own
// leave requests whose StartDate falls in that year + the live entitlement
// summary for the year + the leave types they may request.
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const me = await requireSelfEmployee(user);
  if ("error" in me) return me.error;

  const yearParam = new URL(request.url).searchParams.get("year");
  const year = yearParam ? Number(yearParam) : new Date().getFullYear();
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return apiError(400, "INVALID_PARAMS", "year is invalid");

  return apiSuccess(await getMobileLeaveData(me.employee, year));
}

// POST: create a DRAFT leave request for the logged-in employee themself —
// empCode is never read from the body.
export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const me = await requireSelfEmployee(user);
  if ("error" in me) return me.error;
  const employee = me.employee;

  let body: { leaveTypeCode?: unknown; startDate?: unknown; endDate?: unknown; isFullDay?: unknown; hoursRequested?: unknown; hasMedicalCert?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }
  const leaveTypeCode = typeof body.leaveTypeCode === "string" ? body.leaveTypeCode.trim() : "";
  const startDate = typeof body.startDate === "string" ? new Date(body.startDate) : new Date(NaN);
  const isFullDay = body.isFullDay !== false;
  const endDateRaw = typeof body.endDate === "string" && body.endDate ? new Date(body.endDate) : startDate;
  const hoursRequested = body.hoursRequested !== undefined ? Number(body.hoursRequested) : undefined;
  if (!leaveTypeCode || Number.isNaN(startDate.getTime())) return apiError(400, "INVALID_PARAMS", "leaveTypeCode and startDate are required");
  if (isFullDay && Number.isNaN(endDateRaw.getTime())) return apiError(400, "INVALID_PARAMS", "endDate is required when isFullDay is true");

  const span = computeSpan(startDate, endDateRaw, isFullDay, hoursRequested);
  if ("error" in span) return apiError(400, span.error, span.message);

  if (employee.EmployeeStatus !== "ACTIVE") {
    return apiError(409, "EMPLOYEE_NOT_ELIGIBLE", "This employee's status does not allow filing a new leave request", { employeeStatus: employee.EmployeeStatus });
  }
  const leaveType = await prisma.mstLeaveType.findUnique({ where: { LeaveTypeCode: leaveTypeCode } });
  if (!leaveType) return apiError(404, "LEAVE_TYPE_NOT_FOUND", undefined, { leaveTypeCode });
  if (!isLeaveTypeEligible(leaveType.EligibleEmployeeType, employee.EmployeeType)) {
    return apiError(422, "LEAVE_TYPE_NOT_ELIGIBLE", `${leaveType.LeaveTypeName} is restricted to a different employee type`);
  }

  const documentNo = await consumeDocumentNumber("LEAVE", "ใบลา");
  const created = await prisma.trnLeaveRequest.create({
    data: {
      DocumentNo: documentNo,
      EmpCode: employee.EmpCode,
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
  await logAction(user.userId, "CREATE_LEAVE_REQUEST", { targetTable: "trn_leave_request", targetId: String(created.LeaveID), detail: "MOBILE" });
  return apiSuccess({ leaveId: created.LeaveID, documentNo: created.DocumentNo }, 201);
}
