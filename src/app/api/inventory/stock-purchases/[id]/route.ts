import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/inventory/stock-purchases/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_PURCHASE", "read");
  if (denied) return denied;

  const { id } = await ctx.params;
  const purchaseId = Number(id);
  if (!Number.isInteger(purchaseId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.invPurchaseHeader.findUnique({
    where: { PurchaseHeaderID: purchaseId },
    include: {
      Warehouse: { select: { WarehouseName: true } },
      Supplier: { select: { SupplierName: true } },
      Details: { orderBy: { PurchaseDetailID: "asc" }, include: { Product: { select: { ProductName: true, UnitOfMeasure: true, UnitCost: true } } } },
    },
  });
  if (!header) return apiError(404, "STOCK_PURCHASE_NOT_FOUND");
  return apiSuccess(header);
}

// Header fields editable until APPROVED — WarehouseCode/SupplierCode are
// immutable after creation (every line already priced against them).
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/inventory/stock-purchases/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_PURCHASE", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const purchaseId = Number(id);
  if (!Number.isInteger(purchaseId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invPurchaseHeader.findUnique({ where: { PurchaseHeaderID: purchaseId } });
  if (!existing) return apiError(404, "STOCK_PURCHASE_NOT_FOUND");
  if (existing.Status === "APPROVED") {
    return apiError(409, "STOCK_PURCHASE_LOCKED", "An APPROVED purchase can no longer be edited", { status: existing.Status });
  }

  let body: { supplierDeliveryNo?: unknown; deliveryDate?: unknown; remark?: unknown };
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

  const updated = await prisma.invPurchaseHeader.update({
    where: { PurchaseHeaderID: purchaseId },
    data: {
      SupplierDeliveryNo: body.supplierDeliveryNo === null ? null : typeof body.supplierDeliveryNo === "string" ? body.supplierDeliveryNo.trim() || null : undefined,
      DeliveryDate: deliveryDate,
      Remark: body.remark === null ? null : typeof body.remark === "string" ? body.remark.trim() || null : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_STOCK_PURCHASE", { targetTable: "inv_purchase_header", targetId: id });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/inventory/stock-purchases/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_PURCHASE", "delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  const purchaseId = Number(id);
  if (!Number.isInteger(purchaseId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invPurchaseHeader.findUnique({ where: { PurchaseHeaderID: purchaseId } });
  if (!existing) return apiError(404, "STOCK_PURCHASE_NOT_FOUND");
  if (existing.Status !== "DRAFT") {
    return apiError(409, "STOCK_PURCHASE_LOCKED", "Only a DRAFT purchase can be deleted", { status: existing.Status });
  }

  await prisma.$transaction([
    prisma.invPurchaseDetail.deleteMany({ where: { PurchaseHeaderID: purchaseId } }),
    prisma.invPurchaseHeader.delete({ where: { PurchaseHeaderID: purchaseId } }),
  ]);
  await logAction(user.userId, "DELETE_STOCK_PURCHASE", { targetTable: "inv_purchase_header", targetId: id });
  return apiSuccess({ ok: true });
}
