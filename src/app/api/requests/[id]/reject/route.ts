import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { REQUEST_TYPE_DOCTYPE, type RequestType } from "@/lib/request";

// Rejected requests go back to DRAFT (RejectedBy/RejectedDate/RejectReason
// kept as the historical record) so the requester can fix and resubmit —
// same pattern as Worksheet's reject, per BR-018 ("Reject แก้ไข+Submit ใหม่ได้").
export async function POST(request: NextRequest, ctx: RouteContext<"/api/requests/[id]/reject">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.trnRequest.findUnique({ where: { RequestID: requestId } });
  if (!existing) return apiError(404, "REQUEST_NOT_FOUND");

  const denied = await requirePermission(user, REQUEST_TYPE_DOCTYPE[existing.RequestType as RequestType], "approve");
  if (denied) return denied;

  if (existing.Status !== "SUBMITTED") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a SUBMITTED request can be rejected", { currentStatus: existing.Status });
  }

  let body: { reason?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return apiError(400, "INVALID_PARAMS", "reason is required");

  const updated = await prisma.trnRequest.update({
    where: { RequestID: requestId },
    data: { Status: "DRAFT", RejectedBy: user.userId, RejectedDate: new Date(), RejectReason: reason, UpdatedBy: user.userId, UpdatedDate: new Date() },
  });

  await logAction(user.userId, "REJECT_REQUEST", { targetTable: "trn_request", targetId: id, detail: reason });
  return apiSuccess(updated);
}
