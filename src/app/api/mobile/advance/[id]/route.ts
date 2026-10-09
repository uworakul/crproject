import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireSelfEmployee } from "@/lib/mobile-auth";

// POST { action: "SUBMIT" | "CANCEL" } on the employee's OWN advance request.
//   SUBMIT: DRAFT (i.e. rejected by the approver) -> SUBMITTED again.
//   CANCEL: DRAFT or SUBMITTED -> deleted. An APPROVED request can no longer
//           be withdrawn from the phone (it already created a debt).
export async function POST(request: NextRequest, ctx: RouteContext<"/api/mobile/advance/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const me = await requireSelfEmployee(user);
  if ("error" in me) return me.error;

  const { id } = await ctx.params;
  const headerId = Number(id);
  if (!Number.isInteger(headerId)) return apiError(400, "INVALID_PARAMS");

  let body: { action?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }
  if (body.action !== "SUBMIT" && body.action !== "CANCEL") return apiError(400, "INVALID_PARAMS", "action must be SUBMIT or CANCEL");

  const existing = await prisma.trnRequestHeader.findUnique({ where: { RequestHeaderID: headerId }, include: { Details: true } });
  // Only documents that are exactly "my own single-line ADVANCE" are reachable here.
  if (!existing || existing.DocumentCode !== "ADVANCE" || existing.Details.length !== 1 || existing.Details[0].EmpCode !== me.employee.EmpCode) {
    return apiError(404, "REQUEST_NOT_FOUND");
  }

  if (body.action === "SUBMIT") {
    if (existing.Status !== "DRAFT") return apiError(409, "INVALID_STATUS_TRANSITION", "Only a DRAFT request can be submitted", { currentStatus: existing.Status });
    await prisma.trnRequestHeader.update({
      where: { RequestHeaderID: headerId },
      data: { Status: "SUBMITTED", SubmittedDate: new Date(), UpdatedBy: user.userId, UpdatedDate: new Date() },
    });
    await logAction(user.userId, "SUBMIT_REQUEST", { targetTable: "trn_request_header", targetId: id, detail: "MOBILE" });
    return apiSuccess({ requestHeaderId: headerId, status: "SUBMITTED" });
  }

  // Re-check status inside the delete so an approver acting at the same
  // moment cannot have an already-approved request deleted under them.
  const result = await prisma.$transaction(async (tx) => {
    const still = await tx.trnRequestHeader.findFirst({ where: { RequestHeaderID: headerId, Status: { in: ["DRAFT", "SUBMITTED"] } }, select: { RequestHeaderID: true } });
    if (!still) return false;
    await tx.trnRequestDetail.deleteMany({ where: { RequestHeaderID: headerId } });
    await tx.trnRequestHeader.delete({ where: { RequestHeaderID: headerId } });
    return true;
  });
  if (!result) return apiError(409, "INVALID_STATUS_TRANSITION", "This request can no longer be cancelled");
  await logAction(user.userId, "DELETE_REQUEST", { targetTable: "trn_request_header", targetId: id, detail: `MOBILE cancel ${existing.DocumentNo ?? ""} (was ${existing.Status})` });
  return apiSuccess({ requestHeaderId: headerId, cancelled: true });
}
