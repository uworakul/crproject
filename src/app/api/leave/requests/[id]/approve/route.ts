import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getLeaveBalanceForType } from "@/lib/leave-balance";

// Balance check is computed live (2026-09-21) — no more
// mst_employee_leave_balance row dependency, so there's no LEAVE_BALANCE_NOT_FOUND
// case anymore (every leave type always has a derivable entitlement, even if
// it's 0 for an ineligible/not-yet-tenured employee). TotalDays over
// Remaining -> 422 LEAVE_BALANCE_EXCEEDED, same as before.
export async function POST(_req: Request, ctx: RouteContext<"/api/leave/requests/[id]/approve">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "LEAVE_REQUEST", "approve");
  if (denied) return denied;

  const { id } = await ctx.params;
  const leaveId = Number(id);
  if (!Number.isInteger(leaveId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.trnLeaveRequest.findUnique({ where: { LeaveID: leaveId }, include: { LeaveType: true } });
  if (!existing) return apiError(404, "LEAVE_REQUEST_NOT_FOUND");
  if (existing.Status !== "SUBMITTED") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a SUBMITTED leave request can be approved", { currentStatus: existing.Status });
  }

  const year = existing.StartDate.getUTCFullYear();
  const balance = await getLeaveBalanceForType(existing.EmpCode, existing.LeaveTypeCode, year);
  const remaining = Number(balance?.remaining ?? 0);
  if (Number(existing.TotalDays) > remaining) {
    return apiError(422, "LEAVE_BALANCE_EXCEEDED", undefined, {
      requested: existing.TotalDays.toString(),
      remaining: String(remaining),
      entitled: balance?.entitled ?? "0",
    });
  }

  const updated = await prisma.trnLeaveRequest.update({
    where: { LeaveID: leaveId },
    data: { Status: "APPROVED", ApprovedBy: user.userId, ApprovedDate: new Date(), UpdatedBy: user.userId, UpdatedDate: new Date() },
  });

  await logAction(user.userId, "APPROVE_LEAVE_REQUEST", { targetTable: "trn_leave_request", targetId: id });
  return apiSuccess(updated);
}
