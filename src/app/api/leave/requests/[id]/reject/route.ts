import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Reject now bounces Status back to DRAFT with a required reason (2026-09-21,
// mirrors trn_request_header) instead of the old terminal REJECTED status —
// the employee can edit and resubmit instead of filing a brand new request.
export async function POST(request: Request, ctx: RouteContext<"/api/leave/requests/[id]/reject">) {
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

  let body: { reason?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return apiError(400, "INVALID_PARAMS", "reason is required");

  const updated = await prisma.trnLeaveRequest.update({
    where: { LeaveID: leaveId },
    data: { Status: "DRAFT", RejectedBy: user.userId, RejectedDate: new Date(), RejectReason: reason, UpdatedBy: user.userId, UpdatedDate: new Date() },
  });
  await logAction(user.userId, "REJECT_LEAVE_REQUEST", { targetTable: "trn_leave_request", targetId: id, detail: reason });
  return apiSuccess(updated);
}
