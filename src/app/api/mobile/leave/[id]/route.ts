import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireSelfEmployee } from "@/lib/mobile-auth";

// POST { action: "SUBMIT" | "CANCEL" } on the employee's OWN leave request.
//   SUBMIT: DRAFT -> SUBMITTED (medical-cert gate same as the desktop screen).
//   CANCEL: DRAFT or SUBMITTED -> the request is deleted (there is no
//           CANCELLED status in trn_leave_request's CHECK constraint; an
//           APPROVED request can no longer be withdrawn from here — the
//           approver must handle it). The audit log keeps the trail.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/mobile/leave/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const me = await requireSelfEmployee(user);
  if ("error" in me) return me.error;

  const { id } = await ctx.params;
  const leaveId = Number(id);
  if (!Number.isInteger(leaveId)) return apiError(400, "INVALID_PARAMS");

  let body: { action?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }
  if (body.action !== "SUBMIT" && body.action !== "CANCEL") return apiError(400, "INVALID_PARAMS", "action must be SUBMIT or CANCEL");

  const existing = await prisma.trnLeaveRequest.findUnique({ where: { LeaveID: leaveId }, include: { LeaveType: true } });
  // Someone else's request looks exactly like a missing one.
  if (!existing || existing.EmpCode !== me.employee.EmpCode) return apiError(404, "LEAVE_REQUEST_NOT_FOUND");

  if (body.action === "SUBMIT") {
    if (existing.Status !== "DRAFT") {
      return apiError(409, "INVALID_STATUS_TRANSITION", "Only a DRAFT leave request can be submitted", { currentStatus: existing.Status });
    }
    if (existing.LeaveType.RequireMedicalCert && !existing.HasMedicalCert) {
      return apiError(422, "MEDICAL_CERT_REQUIRED", `${existing.LeaveType.LeaveTypeName} requires a medical certificate before it can be submitted`);
    }
    const updated = await prisma.trnLeaveRequest.update({
      where: { LeaveID: leaveId },
      data: { Status: "SUBMITTED", UpdatedBy: user.userId, UpdatedDate: new Date() },
    });
    await logAction(user.userId, "SUBMIT_LEAVE_REQUEST", { targetTable: "trn_leave_request", targetId: id, detail: "MOBILE" });
    return apiSuccess({ leaveId, status: updated.Status });
  }

  if (existing.Status !== "DRAFT" && existing.Status !== "SUBMITTED") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a DRAFT or SUBMITTED leave request can be cancelled", { currentStatus: existing.Status });
  }
  // Re-check the status inside the delete so an approver acting at the same
  // moment cannot have an already-approved request deleted under them.
  const deleted = await prisma.trnLeaveRequest.deleteMany({ where: { LeaveID: leaveId, Status: { in: ["DRAFT", "SUBMITTED"] } } });
  if (deleted.count === 0) return apiError(409, "INVALID_STATUS_TRANSITION", "This leave request can no longer be cancelled");
  await logAction(user.userId, "CANCEL_LEAVE_REQUEST", { targetTable: "trn_leave_request", targetId: id, detail: `MOBILE ${existing.DocumentNo ?? ""} (was ${existing.Status})` });
  return apiSuccess({ leaveId, cancelled: true });
}
