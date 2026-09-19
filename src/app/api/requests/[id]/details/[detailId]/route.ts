import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { REQUEST_DOCUMENT_DOCTYPE, type RequestDocumentCode } from "@/lib/request";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/requests/[id]/details/[detailId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id, detailId } = await ctx.params;
  const requestId = Number(id);
  const detailIdNum = Number(detailId);
  if (!Number.isInteger(requestId) || !Number.isInteger(detailIdNum)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.trnRequestHeader.findUnique({ where: { RequestHeaderID: requestId } });
  if (!header) return apiError(404, "REQUEST_NOT_FOUND");

  const denied = await requirePermission(user, REQUEST_DOCUMENT_DOCTYPE[header.DocumentCode as RequestDocumentCode], "save");
  if (denied) return denied;

  if (header.Status === "APPROVED") {
    return apiError(409, "REQUEST_LOCKED", "An APPROVED request can no longer be edited", { status: header.Status });
  }

  const existing = await prisma.trnRequestDetail.findUnique({ where: { RequestDetailID: detailIdNum } });
  if (!existing || existing.RequestHeaderID !== requestId) return apiError(404, "REQUEST_DETAIL_NOT_FOUND");

  let body: { amount?: unknown; deductPerPeriod?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  if (body.amount !== undefined) {
    const n = Number(body.amount);
    if (!Number.isFinite(n) || n <= 0) return apiError(400, "VALIDATION_FAILED", "amount must be greater than 0");
  }
  if (body.deductPerPeriod !== undefined) {
    const n = Number(body.deductPerPeriod);
    if (!Number.isFinite(n) || n < 0) return apiError(400, "VALIDATION_FAILED", "deductPerPeriod must be non-negative");
  }

  const updated = await prisma.trnRequestDetail.update({
    where: { RequestDetailID: detailIdNum },
    data: {
      Amount: body.amount !== undefined ? Number(body.amount) : undefined,
      DeductPerPeriod: body.deductPerPeriod !== undefined ? Number(body.deductPerPeriod) : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_REQUEST_DETAIL", { targetTable: "trn_request_detail", targetId: detailId });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/requests/[id]/details/[detailId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id, detailId } = await ctx.params;
  const requestId = Number(id);
  const detailIdNum = Number(detailId);
  if (!Number.isInteger(requestId) || !Number.isInteger(detailIdNum)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.trnRequestHeader.findUnique({ where: { RequestHeaderID: requestId } });
  if (!header) return apiError(404, "REQUEST_NOT_FOUND");

  const denied = await requirePermission(user, REQUEST_DOCUMENT_DOCTYPE[header.DocumentCode as RequestDocumentCode], "delete");
  if (denied) return denied;

  if (header.Status === "APPROVED") {
    return apiError(409, "REQUEST_LOCKED", "An APPROVED request can no longer be edited", { status: header.Status });
  }

  const existing = await prisma.trnRequestDetail.findUnique({ where: { RequestDetailID: detailIdNum } });
  if (!existing || existing.RequestHeaderID !== requestId) return apiError(404, "REQUEST_DETAIL_NOT_FOUND");

  await prisma.trnRequestDetail.delete({ where: { RequestDetailID: detailIdNum } });
  await logAction(user.userId, "DELETE_REQUEST_DETAIL", { targetTable: "trn_request_detail", targetId: detailId });
  return apiSuccess({ ok: true });
}
