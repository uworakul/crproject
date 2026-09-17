import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Balance check mirrors Request & Approve's quota check exactly: no
// mst_employee_leave_balance row at all -> 422 (never silently create one),
// TotalDays over Remaining -> 422. Approve deducts Used/Remaining in the
// same transaction as the status flip.
export async function POST(_req: Request, ctx: RouteContext<"/api/leave/requests/[id]/approve">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "LEAVE_REQUEST", "approve");
  if (denied) return denied;

  const { id } = await ctx.params;
  const leaveId = Number(id);
  if (!Number.isInteger(leaveId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.trnLeaveRequest.findUnique({ where: { LeaveID: leaveId } });
  if (!existing) return apiError(404, "LEAVE_REQUEST_NOT_FOUND");
  if (existing.Status !== "SUBMITTED") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a SUBMITTED leave request can be approved", { currentStatus: existing.Status });
  }

  const year = existing.StartDate.getUTCFullYear();
  const balance = await prisma.mstEmployeeLeaveBalance.findUnique({
    where: { EmpCode_LeaveTypeCode_Year: { EmpCode: existing.EmpCode, LeaveTypeCode: existing.LeaveTypeCode, Year: year } },
  });
  if (!balance) return apiError(422, "LEAVE_BALANCE_NOT_FOUND", undefined, { empCode: existing.EmpCode, leaveTypeCode: existing.LeaveTypeCode, year });
  if (existing.TotalDays.gt(balance.Remaining)) {
    return apiError(422, "LEAVE_BALANCE_EXCEEDED", undefined, { requested: existing.TotalDays.toString(), remaining: balance.Remaining.toString() });
  }

  const newUsed = balance.Used.add(existing.TotalDays);
  const newRemaining = balance.Remaining.sub(existing.TotalDays);

  const [updated] = await prisma.$transaction([
    prisma.trnLeaveRequest.update({ where: { LeaveID: leaveId }, data: { Status: "APPROVED", ApprovedBy: user.userId, ApprovedDate: new Date() } }),
    prisma.mstEmployeeLeaveBalance.update({ where: { BalanceID: balance.BalanceID }, data: { Used: newUsed, Remaining: newRemaining } }),
  ]);

  await logAction(user.userId, "APPROVE_LEAVE_REQUEST", { targetTable: "trn_leave_request", targetId: id });
  return apiSuccess(updated);
}
