import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { REQUEST_DOCUMENT_DOCTYPE, type RequestDocumentCode } from "@/lib/request";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/requests/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.trnRequestHeader.findUnique({
    where: { RequestHeaderID: requestId },
    include: {
      Details: { orderBy: { RequestDetailID: "asc" }, include: { Employee: { select: { FullName: true, EmployeeStatus: true, StartDate: true } } } },
    },
  });
  if (!header) return apiError(404, "REQUEST_NOT_FOUND");

  const denied = await requirePermission(user, REQUEST_DOCUMENT_DOCTYPE[header.DocumentCode as RequestDocumentCode], "read");
  if (denied) return denied;

  return apiSuccess(header);
}

// Header fields (requestDate/remark) are editable until APPROVED — line
// items have their own endpoint (details/route.ts) with the same rule.
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/requests/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.trnRequestHeader.findUnique({ where: { RequestHeaderID: requestId } });
  if (!existing) return apiError(404, "REQUEST_NOT_FOUND");

  const denied = await requirePermission(user, REQUEST_DOCUMENT_DOCTYPE[existing.DocumentCode as RequestDocumentCode], "save");
  if (denied) return denied;

  if (existing.Status === "APPROVED") {
    return apiError(409, "REQUEST_LOCKED", "An APPROVED request can no longer be edited", { status: existing.Status });
  }

  let body: { requestDate?: unknown; remark?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  let requestDate: Date | undefined;
  if (typeof body.requestDate === "string" && body.requestDate) {
    requestDate = new Date(body.requestDate);
    if (Number.isNaN(requestDate.getTime())) return apiError(400, "VALIDATION_FAILED", "requestDate is invalid");
  }

  const updated = await prisma.trnRequestHeader.update({
    where: { RequestHeaderID: requestId },
    data: {
      RequestDate: requestDate,
      Remark: body.remark === null ? null : typeof body.remark === "string" ? body.remark.trim() || null : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_REQUEST", { targetTable: "trn_request_header", targetId: id });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/requests/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.trnRequestHeader.findUnique({ where: { RequestHeaderID: requestId } });
  if (!existing) return apiError(404, "REQUEST_NOT_FOUND");

  const denied = await requirePermission(user, REQUEST_DOCUMENT_DOCTYPE[existing.DocumentCode as RequestDocumentCode], "delete");
  if (denied) return denied;

  if (existing.Status !== "DRAFT") {
    return apiError(409, "REQUEST_LOCKED", "Only a DRAFT request can be deleted", { status: existing.Status });
  }

  await prisma.$transaction([
    prisma.trnRequestDetail.deleteMany({ where: { RequestHeaderID: requestId } }),
    prisma.trnRequestHeader.delete({ where: { RequestHeaderID: requestId } }),
  ]);
  await logAction(user.userId, "DELETE_REQUEST", { targetTable: "trn_request_header", targetId: id });
  return apiSuccess({ ok: true });
}
