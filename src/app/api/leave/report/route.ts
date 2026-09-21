import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getLeaveBalanceSummary } from "@/lib/leave-balance";

// Leave History Report (BR scope: 2 screens for this module — Leave Request
// and this report). Filterable by employee and/or year; returns the raw
// history plus a per-employee/per-type Used/Remaining summary for that year,
// computed live (2026-09-21 — see getLeaveBalanceSummary, mst_employee_leave_balance
// is no longer the source of truth). Balance summary requires both empCode
// and year (it's computed per employee, per year — "ทั้งหมด" only applies to
// the raw history list).
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

  let balances: (Awaited<ReturnType<typeof getLeaveBalanceSummary>>[number] & { empCode: string; employeeName: string; year: number })[] = [];
  if (empCode && year) {
    const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode }, select: { FullName: true } });
    const summary = await getLeaveBalanceSummary(empCode, year);
    balances = summary.map((s) => ({ ...s, empCode, employeeName: employee?.FullName ?? empCode, year }));
  }

  return apiSuccess({ history, balances });
}
