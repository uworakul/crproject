import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Unlike trn_request, trn_leave_request has no RejectReason/RejectedBy/
// RejectedDate columns — only Status. So reject is terminal here (matches
// the DDL's own design, not a gap): REJECTED requests can't be edited or
// resubmitted; the employee files a new request if they want to try again.
// The full audit trail (who/when) still lands in sys_process_log via logAction.
export async function POST(_req: Request, ctx: RouteContext<"/api/leave/requests/[id]/reject">) {
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
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a SUBMITTED leave request can be rejected", { currentStatus: existing.Status });
  }

  const updated = await prisma.trnLeaveRequest.update({ where: { LeaveID: leaveId }, data: { Status: "REJECTED" } });
  await logAction(user.userId, "REJECT_LEAVE_REQUEST", { targetTable: "trn_leave_request", targetId: id });
  return apiSuccess(updated);
}
