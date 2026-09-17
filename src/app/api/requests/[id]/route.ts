import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { REQUEST_TYPE_DOCTYPE, type RequestType } from "@/lib/request";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/requests/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) return apiError(400, "INVALID_PARAMS");

  const req = await prisma.trnRequest.findUnique({
    where: { RequestID: requestId },
    include: { Employee: { select: { FullName: true } } },
  });
  if (!req) return apiError(404, "REQUEST_NOT_FOUND");

  const denied = await requirePermission(user, REQUEST_TYPE_DOCTYPE[req.RequestType as RequestType], "read");
  if (denied) return denied;

  return apiSuccess(req);
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/requests/[id]">) {
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
    return apiError(409, "REQUEST_LOCKED", "Only a DRAFT request can be edited", { status: existing.Status });
  }

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

  const updated = await prisma.trnRequest.update({
    where: { RequestID: requestId },
    data: {
      Amount: body.amount !== undefined ? Number(body.amount) : undefined,
      DeductPerPeriod: body.deductPerPeriod !== undefined ? Number(body.deductPerPeriod) : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_REQUEST", { targetTable: "trn_request", targetId: id });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/requests/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.trnRequest.findUnique({ where: { RequestID: requestId } });
  if (!existing) return apiError(404, "REQUEST_NOT_FOUND");

  const denied = await requirePermission(user, REQUEST_TYPE_DOCTYPE[existing.RequestType as RequestType], "delete");
  if (denied) return denied;

  if (existing.Status !== "DRAFT") {
    return apiError(409, "REQUEST_LOCKED", "Only a DRAFT request can be deleted", { status: existing.Status });
  }

  await prisma.trnRequest.delete({ where: { RequestID: requestId } });
  await logAction(user.userId, "DELETE_REQUEST", { targetTable: "trn_request", targetId: id });
  return apiSuccess({ ok: true });
}
