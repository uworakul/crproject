import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function POST(_req: Request, ctx: RouteContext<"/api/leave/requests/[id]/submit">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "LEAVE_REQUEST", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const leaveId = Number(id);
  if (!Number.isInteger(leaveId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.trnLeaveRequest.findUnique({ where: { LeaveID: leaveId }, include: { LeaveType: true } });
  if (!existing) return apiError(404, "LEAVE_REQUEST_NOT_FOUND");
  if (existing.Status !== "DRAFT") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a DRAFT leave request can be submitted", { currentStatus: existing.Status });
  }

  // mst_leave_type.RequireMedicalCert — enforced at submit, not creation,
  // so the requester can attach the certificate before sending it for approval.
  if (existing.LeaveType.RequireMedicalCert && !existing.HasMedicalCert) {
    return apiError(422, "MEDICAL_CERT_REQUIRED", `${existing.LeaveType.LeaveTypeName} requires a medical certificate before it can be submitted`);
  }

  const updated = await prisma.trnLeaveRequest.update({ where: { LeaveID: leaveId }, data: { Status: "SUBMITTED" } });
  await logAction(user.userId, "SUBMIT_LEAVE_REQUEST", { targetTable: "trn_leave_request", targetId: id });
  return apiSuccess(updated);
}
