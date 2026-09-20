import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Flat endpoint — see stock-count-details/[detailId]/route.ts.
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/inventory/stock-return-details/[detailId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_RETURN", "save");
  if (denied) return denied;

  const { detailId } = await ctx.params;
  const detailIdNum = Number(detailId);
  if (!Number.isInteger(detailIdNum)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invReturnDetail.findUnique({ where: { ReturnDetailID: detailIdNum } });
  if (!existing) return apiError(404, "STOCK_RETURN_DETAIL_NOT_FOUND");

  const header = await prisma.invReturnHeader.findUnique({ where: { ReturnHeaderID: existing.ReturnHeaderID } });
  if (!header) return apiError(404, "STOCK_RETURN_NOT_FOUND");
  if (header.Status === "APPROVED") {
    return apiError(409, "STOCK_RETURN_LOCKED", "An APPROVED return can no longer be edited", { status: header.Status });
  }

  let body: { qty?: unknown; unitPrice?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  if (body.qty !== undefined) {
    const n = Number(body.qty);
    if (!Number.isFinite(n) || n <= 0) return apiError(400, "VALIDATION_FAILED", "qty must be greater than 0");
  }
  if (body.unitPrice !== undefined) {
    const n = Number(body.unitPrice);
    if (!Number.isFinite(n) || n < 0) return apiError(400, "VALIDATION_FAILED", "unitPrice must be non-negative");
  }

  const qty = body.qty !== undefined ? Number(body.qty) : Number(existing.Qty);
  const unitPrice = body.unitPrice !== undefined ? Number(body.unitPrice) : Number(existing.UnitPrice);

  const updated = await prisma.invReturnDetail.update({
    where: { ReturnDetailID: detailIdNum },
    data: { Qty: qty, UnitPrice: unitPrice, Amount: qty * unitPrice, UpdatedBy: user.userId, UpdatedDate: new Date() },
  });

  await logAction(user.userId, "UPDATE_STOCK_RETURN_DETAIL", { targetTable: "inv_return_detail", targetId: detailId });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/inventory/stock-return-details/[detailId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_RETURN", "delete");
  if (denied) return denied;

  const { detailId } = await ctx.params;
  const detailIdNum = Number(detailId);
  if (!Number.isInteger(detailIdNum)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invReturnDetail.findUnique({ where: { ReturnDetailID: detailIdNum } });
  if (!existing) return apiError(404, "STOCK_RETURN_DETAIL_NOT_FOUND");

  const header = await prisma.invReturnHeader.findUnique({ where: { ReturnHeaderID: existing.ReturnHeaderID } });
  if (!header) return apiError(404, "STOCK_RETURN_NOT_FOUND");
  if (header.Status === "APPROVED") {
    return apiError(409, "STOCK_RETURN_LOCKED", "An APPROVED return can no longer be edited", { status: header.Status });
  }

  await prisma.invReturnDetail.delete({ where: { ReturnDetailID: detailIdNum } });
  await logAction(user.userId, "DELETE_STOCK_RETURN_DETAIL", { targetTable: "inv_return_detail", targetId: detailId });
  return apiSuccess({ ok: true });
}
