import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Flat "/api/inventory/stock-count-details/[detailId]" instead of nesting
// under "/api/inventory/stock-counts/[id]/details/[detailId]" — the nested
// form hit a real Next.js 16.3.5 bug where its typed-routes generator
// produces malformed/duplicated TypeScript for a route with two dynamic
// segments this deep (.next/dev/types/routes.d.ts came out with a broken
// duplicate `interface RouteContext` block, confirmed via `next build`'s
// "Failed to type check" error), which silently drops the route from the
// dev router (404 on every request, even after repeated clean .next +
// single-process restarts). StockCountDetailID is already a globally-unique
// PK, so the header ID in the URL was redundant anyway — this endpoint
// looks up the header via the fetched detail row's StockCountHeaderID.

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/inventory/stock-count-details/[detailId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_COUNT", "save");
  if (denied) return denied;

  const { detailId } = await ctx.params;
  const detailIdNum = Number(detailId);
  if (!Number.isInteger(detailIdNum)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invStockCountDetail.findUnique({ where: { StockCountDetailID: detailIdNum } });
  if (!existing) return apiError(404, "STOCK_COUNT_DETAIL_NOT_FOUND");

  const header = await prisma.invStockCountHeader.findUnique({ where: { StockCountHeaderID: existing.StockCountHeaderID } });
  if (!header) return apiError(404, "STOCK_COUNT_NOT_FOUND");
  if (header.Status === "APPROVED") {
    return apiError(409, "STOCK_COUNT_LOCKED", "An APPROVED stock count can no longer be edited", { status: header.Status });
  }

  let body: { countedQty?: unknown; countedSecondHandQty?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  if (body.countedQty !== undefined) {
    const n = Number(body.countedQty);
    if (!Number.isFinite(n) || n < 0) return apiError(400, "VALIDATION_FAILED", "countedQty must be non-negative");
  }
  if (body.countedSecondHandQty !== undefined) {
    const n = Number(body.countedSecondHandQty);
    if (!Number.isFinite(n) || n < 0) return apiError(400, "VALIDATION_FAILED", "countedSecondHandQty must be non-negative");
  }

  const updated = await prisma.invStockCountDetail.update({
    where: { StockCountDetailID: detailIdNum },
    data: {
      CountedQty: body.countedQty !== undefined ? Number(body.countedQty) : undefined,
      CountedSecondHandQty: body.countedSecondHandQty !== undefined ? Number(body.countedSecondHandQty) : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_STOCK_COUNT_DETAIL", { targetTable: "inv_stock_count_detail", targetId: detailId });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/inventory/stock-count-details/[detailId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_COUNT", "delete");
  if (denied) return denied;

  const { detailId } = await ctx.params;
  const detailIdNum = Number(detailId);
  if (!Number.isInteger(detailIdNum)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invStockCountDetail.findUnique({ where: { StockCountDetailID: detailIdNum } });
  if (!existing) return apiError(404, "STOCK_COUNT_DETAIL_NOT_FOUND");

  const header = await prisma.invStockCountHeader.findUnique({ where: { StockCountHeaderID: existing.StockCountHeaderID } });
  if (!header) return apiError(404, "STOCK_COUNT_NOT_FOUND");
  if (header.Status === "APPROVED") {
    return apiError(409, "STOCK_COUNT_LOCKED", "An APPROVED stock count can no longer be edited", { status: header.Status });
  }

  await prisma.invStockCountDetail.delete({ where: { StockCountDetailID: detailIdNum } });
  await logAction(user.userId, "DELETE_STOCK_COUNT_DETAIL", { targetTable: "inv_stock_count_detail", targetId: detailId });
  return apiSuccess({ ok: true });
}
