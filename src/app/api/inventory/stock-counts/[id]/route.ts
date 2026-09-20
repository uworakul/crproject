import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/inventory/stock-counts/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_COUNT", "read");
  if (denied) return denied;

  const { id } = await ctx.params;
  const stockCountId = Number(id);
  if (!Number.isInteger(stockCountId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.invStockCountHeader.findUnique({
    where: { StockCountHeaderID: stockCountId },
    include: {
      Warehouse: { select: { WarehouseName: true } },
      Details: { orderBy: { StockCountDetailID: "asc" }, include: { Product: { select: { ProductName: true, UnitOfMeasure: true } } } },
    },
  });
  if (!header) return apiError(404, "STOCK_COUNT_NOT_FOUND");
  return apiSuccess(header);
}

// Header fields (countDate/remark) editable until APPROVED — same rule as
// line items (details/route.ts). WarehouseCode is immutable after creation
// (every line item is already counted against it).
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/inventory/stock-counts/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_COUNT", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const stockCountId = Number(id);
  if (!Number.isInteger(stockCountId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invStockCountHeader.findUnique({ where: { StockCountHeaderID: stockCountId } });
  if (!existing) return apiError(404, "STOCK_COUNT_NOT_FOUND");
  if (existing.Status === "APPROVED") {
    return apiError(409, "STOCK_COUNT_LOCKED", "An APPROVED stock count can no longer be edited", { status: existing.Status });
  }

  let body: { countDate?: unknown; remark?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  let countDate: Date | undefined;
  if (typeof body.countDate === "string" && body.countDate) {
    countDate = new Date(body.countDate);
    if (Number.isNaN(countDate.getTime())) return apiError(400, "VALIDATION_FAILED", "countDate is invalid");
  }

  const updated = await prisma.invStockCountHeader.update({
    where: { StockCountHeaderID: stockCountId },
    data: {
      CountDate: countDate,
      Remark: body.remark === null ? null : typeof body.remark === "string" ? body.remark.trim() || null : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_STOCK_COUNT", { targetTable: "inv_stock_count_header", targetId: id });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/inventory/stock-counts/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_COUNT", "delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  const stockCountId = Number(id);
  if (!Number.isInteger(stockCountId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invStockCountHeader.findUnique({ where: { StockCountHeaderID: stockCountId } });
  if (!existing) return apiError(404, "STOCK_COUNT_NOT_FOUND");
  if (existing.Status !== "DRAFT") {
    return apiError(409, "STOCK_COUNT_LOCKED", "Only a DRAFT stock count can be deleted", { status: existing.Status });
  }

  await prisma.$transaction([
    prisma.invStockCountDetail.deleteMany({ where: { StockCountHeaderID: stockCountId } }),
    prisma.invStockCountHeader.delete({ where: { StockCountHeaderID: stockCountId } }),
  ]);
  await logAction(user.userId, "DELETE_STOCK_COUNT", { targetTable: "inv_stock_count_header", targetId: id });
  return apiSuccess({ ok: true });
}
