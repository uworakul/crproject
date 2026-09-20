import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/inventory/stock-returns/[id]/reject">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_RETURN", "approve");
  if (denied) return denied;

  const { id } = await ctx.params;
  const returnId = Number(id);
  if (!Number.isInteger(returnId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invReturnHeader.findUnique({ where: { ReturnHeaderID: returnId } });
  if (!existing) return apiError(404, "STOCK_RETURN_NOT_FOUND");

  if (existing.Status !== "SUBMITTED") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a SUBMITTED return can be rejected", { currentStatus: existing.Status });
  }

  let body: { reason?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return apiError(400, "INVALID_PARAMS", "reason is required");

  const updated = await prisma.invReturnHeader.update({
    where: { ReturnHeaderID: returnId },
    data: { Status: "DRAFT", RejectedBy: user.userId, RejectedDate: new Date(), RejectReason: reason, UpdatedBy: user.userId, UpdatedDate: new Date() },
  });

  await logAction(user.userId, "REJECT_STOCK_RETURN", { targetTable: "inv_return_header", targetId: id, detail: reason });
  return apiSuccess(updated);
}
