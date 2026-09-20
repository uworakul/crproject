import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Flat "/api/inventory/stock-purchase-details/[detailId]" instead of nesting
// under "/api/inventory/stock-purchases/[id]/details/[detailId]" — the
// nested form is exactly the shape that hit a real Next.js 16.3.5 typed-
// routes generator bug on the ตรวจนับสต๊อก module (two dynamic segments at
// this path depth corrupt .next/dev/types/routes.d.ts and the route 404s on
// every request). PurchaseDetailID is already a globally-unique PK, so the
// header ID in the URL was never needed — this endpoint looks up the header
// via the fetched detail row's PurchaseHeaderID.

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/inventory/stock-purchase-details/[detailId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_PURCHASE", "save");
  if (denied) return denied;

  const { detailId } = await ctx.params;
  const detailIdNum = Number(detailId);
  if (!Number.isInteger(detailIdNum)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invPurchaseDetail.findUnique({ where: { PurchaseDetailID: detailIdNum } });
  if (!existing) return apiError(404, "STOCK_PURCHASE_DETAIL_NOT_FOUND");

  const header = await prisma.invPurchaseHeader.findUnique({ where: { PurchaseHeaderID: existing.PurchaseHeaderID } });
  if (!header) return apiError(404, "STOCK_PURCHASE_NOT_FOUND");
  if (header.Status === "APPROVED") {
    return apiError(409, "STOCK_PURCHASE_LOCKED", "An APPROVED purchase can no longer be edited", { status: header.Status });
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

  const updated = await prisma.invPurchaseDetail.update({
    where: { PurchaseDetailID: detailIdNum },
    data: {
      Qty: qty,
      UnitPrice: unitPrice,
      Amount: qty * unitPrice,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_STOCK_PURCHASE_DETAIL", { targetTable: "inv_purchase_detail", targetId: detailId });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/inventory/stock-purchase-details/[detailId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_PURCHASE", "delete");
  if (denied) return denied;

  const { detailId } = await ctx.params;
  const detailIdNum = Number(detailId);
  if (!Number.isInteger(detailIdNum)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invPurchaseDetail.findUnique({ where: { PurchaseDetailID: detailIdNum } });
  if (!existing) return apiError(404, "STOCK_PURCHASE_DETAIL_NOT_FOUND");

  const header = await prisma.invPurchaseHeader.findUnique({ where: { PurchaseHeaderID: existing.PurchaseHeaderID } });
  if (!header) return apiError(404, "STOCK_PURCHASE_NOT_FOUND");
  if (header.Status === "APPROVED") {
    return apiError(409, "STOCK_PURCHASE_LOCKED", "An APPROVED purchase can no longer be edited", { status: header.Status });
  }

  await prisma.invPurchaseDetail.delete({ where: { PurchaseDetailID: detailIdNum } });
  await logAction(user.userId, "DELETE_STOCK_PURCHASE_DETAIL", { targetTable: "inv_purchase_detail", targetId: detailId });
  return apiSuccess({ ok: true });
}
