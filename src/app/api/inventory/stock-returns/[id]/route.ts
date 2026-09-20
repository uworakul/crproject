import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/inventory/stock-returns/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_RETURN", "read");
  if (denied) return denied;

  const { id } = await ctx.params;
  const returnId = Number(id);
  if (!Number.isInteger(returnId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.invReturnHeader.findUnique({
    where: { ReturnHeaderID: returnId },
    include: {
      Warehouse: { select: { WarehouseName: true } },
      Employee: { select: { FullName: true, Site: { select: { SiteName: true } } } },
      Details: { orderBy: { ReturnDetailID: "asc" }, include: { Product: { select: { ProductName: true, UnitOfMeasure: true } } } },
    },
  });
  if (!header) return apiError(404, "STOCK_RETURN_NOT_FOUND");
  return apiSuccess(header);
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/inventory/stock-returns/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_RETURN", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const returnId = Number(id);
  if (!Number.isInteger(returnId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invReturnHeader.findUnique({ where: { ReturnHeaderID: returnId } });
  if (!existing) return apiError(404, "STOCK_RETURN_NOT_FOUND");
  if (existing.Status === "APPROVED") {
    return apiError(409, "STOCK_RETURN_LOCKED", "An APPROVED return can no longer be edited", { status: existing.Status });
  }

  let body: { deliveryNo?: unknown; deliveryDate?: unknown; remark?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  let deliveryDate: Date | undefined;
  if (typeof body.deliveryDate === "string" && body.deliveryDate) {
    deliveryDate = new Date(body.deliveryDate);
    if (Number.isNaN(deliveryDate.getTime())) return apiError(400, "VALIDATION_FAILED", "deliveryDate is invalid");
  }

  const updated = await prisma.invReturnHeader.update({
    where: { ReturnHeaderID: returnId },
    data: {
      DeliveryNo: body.deliveryNo === null ? null : typeof body.deliveryNo === "string" ? body.deliveryNo.trim() || null : undefined,
      DeliveryDate: deliveryDate,
      Remark: body.remark === null ? null : typeof body.remark === "string" ? body.remark.trim() || null : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_STOCK_RETURN", { targetTable: "inv_return_header", targetId: id });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/inventory/stock-returns/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_RETURN", "delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  const returnId = Number(id);
  if (!Number.isInteger(returnId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invReturnHeader.findUnique({ where: { ReturnHeaderID: returnId } });
  if (!existing) return apiError(404, "STOCK_RETURN_NOT_FOUND");
  if (existing.Status !== "DRAFT") {
    return apiError(409, "STOCK_RETURN_LOCKED", "Only a DRAFT return can be deleted", { status: existing.Status });
  }

  await prisma.$transaction([
    prisma.invReturnDetail.deleteMany({ where: { ReturnHeaderID: returnId } }),
    prisma.invReturnHeader.delete({ where: { ReturnHeaderID: returnId } }),
  ]);
  await logAction(user.userId, "DELETE_STOCK_RETURN", { targetTable: "inv_return_header", targetId: id });
  return apiSuccess({ ok: true });
}
