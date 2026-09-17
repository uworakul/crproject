import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";

// Leave History Report (BR scope: 2 screens for this module — Leave Request
// and this report). Filterable by employee and/or year; returns the raw
// history plus a per-employee/per-type Used/Remaining summary for that year.
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "LEAVE_REPORT", "read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const empCode = searchParams.get("empCode");
  const yearParam = searchParams.get("year");
  const year = yearParam ? Number(yearParam) : undefined;
  if (yearParam && !Number.isInteger(year)) return apiError(400, "INVALID_PARAMS", "year must be an integer");

  const history = await prisma.trnLeaveRequest.findMany({
    where: {
      ...(empCode ? { EmpCode: empCode } : {}),
      ...(year ? { StartDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } } : {}),
    },
    include: { Employee: { select: { FullName: true } }, LeaveType: { select: { LeaveTypeName: true } } },
    orderBy: { StartDate: "desc" },
  });

  const balances = await prisma.mstEmployeeLeaveBalance.findMany({
    where: { ...(empCode ? { EmpCode: empCode } : {}), ...(year ? { Year: year } : {}) },
    include: { Employee: { select: { FullName: true } }, LeaveType: { select: { LeaveTypeName: true } } },
    orderBy: [{ EmpCode: "asc" }, { LeaveTypeCode: "asc" }],
  });

  return apiSuccess({ history, balances });
}
