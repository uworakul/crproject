import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { REQUEST_TYPE_DOCTYPE, type RequestType } from "@/lib/request";

export async function POST(_req: Request, ctx: RouteContext<"/api/requests/[id]/submit">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.trnRequest.findUnique({ where: { RequestID: requestId } });
  if (!existing) return apiError(404, "REQUEST_NOT_FOUND");

  const denied = await requirePermission(user, REQUEST_TYPE_DOCTYPE[existing.RequestType as RequestType], "save");
  if (denied) return denied;

  if (existing.Status !== "DRAFT") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a DRAFT request can be submitted", { currentStatus: existing.Status });
  }

  const updated = await prisma.trnRequest.update({
    where: { RequestID: requestId },
    data: { Status: "SUBMITTED", SubmittedDate: new Date() },
  });

  await logAction(user.userId, "SUBMIT_REQUEST", { targetTable: "trn_request", targetId: id });
  return apiSuccess(updated);
}
