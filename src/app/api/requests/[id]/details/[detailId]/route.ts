import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { REQUEST_DOCUMENT_DOCTYPE, REQUEST_DOCUMENT_KIND, type RequestDocumentCode } from "@/lib/request";

// 2026-09-28 — body shape depends on the header's DocumentCode kind, same
// as POST .../details (see that file's comment). OldPositionCode/OldIncome
// stay frozen from add-time — only NewPositionCode can be edited here.
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/requests/[id]/details/[detailId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id, detailId } = await ctx.params;
  const requestId = Number(id);
  const detailIdNum = Number(detailId);
  if (!Number.isInteger(requestId) || !Number.isInteger(detailIdNum)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.trnRequestHeader.findUnique({ where: { RequestHeaderID: requestId } });
  if (!header) return apiError(404, "REQUEST_NOT_FOUND");

  const documentCode = header.DocumentCode as RequestDocumentCode;
  const denied = await requirePermission(user, REQUEST_DOCUMENT_DOCTYPE[documentCode], "save");
  if (denied) return denied;

  if (header.Status === "APPROVED") {
    return apiError(409, "REQUEST_LOCKED", "An APPROVED request can no longer be edited", { status: header.Status });
  }

  const existing = await prisma.trnRequestDetail.findUnique({ where: { RequestDetailID: detailIdNum } });
  if (!existing || existing.RequestHeaderID !== requestId) return apiError(404, "REQUEST_DETAIL_NOT_FOUND");

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const kind = REQUEST_DOCUMENT_KIND[documentCode];
  const data: Record<string, unknown> = {};

  if (kind === "DEBT" || kind === "INCOME") {
    if (body.amount !== undefined) {
      const n = Number(body.amount);
      if (!Number.isFinite(n) || n <= 0) return apiError(400, "VALIDATION_FAILED", "amount must be greater than 0");
      data.Amount = n;
    }
    if (body.deductPerPeriod !== undefined) {
      const n = Number(body.deductPerPeriod);
      if (!Number.isFinite(n) || n < 0) return apiError(400, "VALIDATION_FAILED", "deductPerPeriod must be non-negative");
      data.DeductPerPeriod = n;
    }
  } else if (kind === "POSITION_CHANGE") {
    if (body.newPositionCode !== undefined) {
      const newPositionCode = typeof body.newPositionCode === "string" ? body.newPositionCode.trim() : "";
      if (!newPositionCode) return apiError(400, "VALIDATION_FAILED", "newPositionCode cannot be empty");
      const newPosition = await prisma.refPosition.findUnique({ where: { PositionCode: newPositionCode } });
      if (!newPosition || !newPosition.IsActive) return apiError(404, "POSITION_NOT_FOUND", undefined, { newPositionCode });
      if (newPositionCode === existing.OldPositionCode) {
        return apiError(400, "VALIDATION_FAILED", "newPositionCode is the same as the employee's current position");
      }
      data.NewPositionCode = newPositionCode;
    }
  } else {
    // RESIGN
    if (body.resignReason !== undefined) {
      const resignReason = typeof body.resignReason === "string" ? body.resignReason.trim() : "";
      if (!resignReason) return apiError(400, "VALIDATION_FAILED", "resignReason cannot be empty");
      data.ResignReason = resignReason;
    }
    if (body.requestedResignDate !== undefined) {
      const s = typeof body.requestedResignDate === "string" ? body.requestedResignDate : "";
      if (!s) return apiError(400, "VALIDATION_FAILED", "requestedResignDate cannot be empty");
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return apiError(400, "VALIDATION_FAILED", "requestedResignDate is invalid");
      data.RequestedResignDate = d;
    }
    if (body.blacklistCode !== undefined) {
      const blacklistCode = typeof body.blacklistCode === "string" && body.blacklistCode.trim() ? body.blacklistCode.trim() : null;
      if (blacklistCode) {
        const bl = await prisma.refBlackList.findFirst({ where: { IDCardNo: blacklistCode } });
        if (!bl) return apiError(404, "BLACKLIST_CODE_NOT_FOUND", undefined, { blacklistCode });
      }
      data.BlacklistCode = blacklistCode;
    }
  }

  const updated = await prisma.trnRequestDetail.update({
    where: { RequestDetailID: detailIdNum },
    data: { ...data, UpdatedBy: user.userId, UpdatedDate: new Date() },
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
