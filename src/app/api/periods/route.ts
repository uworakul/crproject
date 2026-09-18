import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { isValidEmployeeType } from "@/lib/validation";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PERIOD", "read");
  if (denied) return denied;

  const periods = await prisma.sysPeriod.findMany({
    orderBy: [{ EmployeeType: "asc" }, { PayDate: "asc" }],
  });
  return apiSuccess(periods);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PERIOD", "save");
  if (denied) return denied;

  let body: {
    employeeType?: unknown;
    periodYear?: unknown;
    periodMonth?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    payDate?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const periodYear = Number(body.periodYear);
  const periodMonth = Number(body.periodMonth);
  const startDate = typeof body.startDate === "string" ? body.startDate : "";
  const endDate = typeof body.endDate === "string" ? body.endDate : "";
  const payDate = typeof body.payDate === "string" ? body.payDate : "";

  if (!isValidEmployeeType(body.employeeType)) {
    return apiError(400, "VALIDATION_FAILED", "employeeType must be one of the allowed values");
  }
  if (!Number.isFinite(periodYear) || !Number.isFinite(periodMonth) || periodMonth < 1 || periodMonth > 12) {
    return apiError(400, "INVALID_PARAMS", "periodYear and periodMonth (1-12) are required");
  }
  if (!startDate || !endDate || !payDate) {
    return apiError(400, "INVALID_PARAMS", "startDate, endDate, and payDate are required");
  }
  if (new Date(endDate) <= new Date(startDate)) {
    return apiError(400, "VALIDATION_FAILED", "endDate must be after startDate");
  }

  // No UNIQUE constraint on sys_period in the approved DDL. Two periods for
  // the same EmployeeType CAN share a year/month now (e.g. 1-15 and 16-30,
  // to support semi-monthly pay) — approveWorksheet() matches each
  // Worksheet day to a period by which one's [StartDate, EndDate] actually
  // contains that calendar date, not by year/month. What must never happen
  // is two periods for the same EmployeeType with overlapping date ranges —
  // that would make the match ambiguous for any day inside the overlap.
  const overlapping = await prisma.sysPeriod.findFirst({
    where: {
      EmployeeType: body.employeeType,
      StartDate: { lte: new Date(endDate) },
      EndDate: { gte: new Date(startDate) },
    },
  });
  if (overlapping) {
    return apiError(409, "PERIOD_ALREADY_EXISTS", "Date range overlaps an existing period for this employee type", {
      employeeType: body.employeeType,
      conflictingPeriodId: overlapping.PeriodID,
    });
  }

  const created = await prisma.sysPeriod.create({
    data: {
      EmployeeType: body.employeeType,
      PeriodYear: periodYear,
      PeriodMonth: periodMonth,
      StartDate: new Date(startDate),
      EndDate: new Date(endDate),
      PayDate: new Date(payDate),
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "CREATE_PERIOD", { targetTable: "sys_period", targetId: String(created.PeriodID) });
  return apiSuccess(created, 201);
}
