import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/inventory/stock-transfers/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_TRANSFER", "read");
  if (denied) return denied;

  const { id } = await ctx.params;
  const transferId = Number(id);
  if (!Number.isInteger(transferId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.invTransferHeader.findUnique({
    where: { TransferHeaderID: transferId },
    include: {
      SourceWarehouse: { select: { WarehouseName: true } },
      TargetWarehouse: { select: { WarehouseName: true } },
      Details: { orderBy: { TransferDetailID: "asc" }, include: { Product: { select: { ProductName: true, UnitOfMeasure: true } } } },
    },
  });
  if (!header) return apiError(404, "STOCK_TRANSFER_NOT_FOUND");
  return apiSuccess(header);
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/inventory/stock-transfers/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_TRANSFER", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const transferId = Number(id);
  if (!Number.isInteger(transferId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invTransferHeader.findUnique({ where: { TransferHeaderID: transferId } });
  if (!existing) return apiError(404, "STOCK_TRANSFER_NOT_FOUND");
  if (existing.Status === "APPROVED") {
    return apiError(409, "STOCK_TRANSFER_LOCKED", "An APPROVED transfer can no longer be edited", { status: existing.Status });
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

  const updated = await prisma.invTransferHeader.update({
    where: { TransferHeaderID: transferId },
    data: {
      DeliveryNo: body.deliveryNo === null ? null : typeof body.deliveryNo === "string" ? body.deliveryNo.trim() || null : undefined,
      DeliveryDate: deliveryDate,
      Remark: body.remark === null ? null : typeof body.remark === "string" ? body.remark.trim() || null : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_STOCK_TRANSFER", { targetTable: "inv_transfer_header", targetId: id });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/inventory/stock-transfers/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_TRANSFER", "delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  const transferId = Number(id);
  if (!Number.isInteger(transferId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invTransferHeader.findUnique({ where: { TransferHeaderID: transferId } });
  if (!existing) return apiError(404, "STOCK_TRANSFER_NOT_FOUND");
  if (existing.Status !== "DRAFT") {
    return apiError(409, "STOCK_TRANSFER_LOCKED", "Only a DRAFT transfer can be deleted", { status: existing.Status });
  }

  await prisma.$transaction([
    prisma.invTransferDetail.deleteMany({ where: { TransferHeaderID: transferId } }),
    prisma.invTransferHeader.delete({ where: { TransferHeaderID: transferId } }),
  ]);
  await logAction(user.userId, "DELETE_STOCK_TRANSFER", { targetTable: "inv_transfer_header", targetId: id });
  return apiSuccess({ ok: true });
}
