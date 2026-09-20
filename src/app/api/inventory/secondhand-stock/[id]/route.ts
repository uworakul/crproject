import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/inventory/secondhand-stock/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PRODUCT", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const secondhandStockId = Number(id);
  if (!Number.isInteger(secondhandStockId)) return apiError(400, "INVALID_PARAMS", "id must be an integer");

  const existing = await prisma.invSecondhandStock.findUnique({ where: { SecondhandStockID: secondhandStockId } });
  if (!existing) return apiError(404, "SECONDHAND_STOCK_NOT_FOUND");

  let body: { qty?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const qty = Number(body.qty);
  if (!Number.isFinite(qty) || qty < 0) return apiError(400, "VALIDATION_FAILED", "qty must be a non-negative number");

  const updated = await prisma.invSecondhandStock.update({
    where: { SecondhandStockID: secondhandStockId },
    data: { Qty: qty, UpdatedBy: user.userId, UpdatedDate: new Date() },
  });
  await logAction(user.userId, "UPDATE_SECONDHAND_STOCK", {
    targetTable: "inv_secondhand_stock",
    targetId: id,
  });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/inventory/secondhand-stock/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PRODUCT", "delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  const secondhandStockId = Number(id);
  if (!Number.isInteger(secondhandStockId)) return apiError(400, "INVALID_PARAMS", "id must be an integer");

  const existing = await prisma.invSecondhandStock.findUnique({ where: { SecondhandStockID: secondhandStockId } });
  if (!existing) return apiError(404, "SECONDHAND_STOCK_NOT_FOUND");

  await prisma.invSecondhandStock.delete({ where: { SecondhandStockID: secondhandStockId } });
  await logAction(user.userId, "DELETE_SECONDHAND_STOCK", {
    targetTable: "inv_secondhand_stock",
    targetId: id,
  });
  return apiSuccess({ ok: true });
}
