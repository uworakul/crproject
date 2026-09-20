import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getStockBalance } from "@/lib/inventory";

// Flat endpoint (not nested under the header) — see the comment in
// src/app/api/inventory/stock-count-details/[detailId]/route.ts for why
// every "edit/delete a detail line" endpoint in this session uses this
// shape instead of [id]/details/[detailId].
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/inventory/stock-transfer-details/[detailId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_TRANSFER", "save");
  if (denied) return denied;

  const { detailId } = await ctx.params;
  const detailIdNum = Number(detailId);
  if (!Number.isInteger(detailIdNum)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invTransferDetail.findUnique({ where: { TransferDetailID: detailIdNum } });
  if (!existing) return apiError(404, "STOCK_TRANSFER_DETAIL_NOT_FOUND");

  const header = await prisma.invTransferHeader.findUnique({ where: { TransferHeaderID: existing.TransferHeaderID } });
  if (!header) return apiError(404, "STOCK_TRANSFER_NOT_FOUND");
  if (header.Status === "APPROVED") {
    return apiError(409, "STOCK_TRANSFER_LOCKED", "An APPROVED transfer can no longer be edited", { status: header.Status });
  }

  let body: { qty?: unknown; secondHandQty?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  if (body.qty !== undefined) {
    const n = Number(body.qty);
    if (!Number.isFinite(n) || n < 0) return apiError(400, "VALIDATION_FAILED", "qty must be non-negative");
  }
  if (body.secondHandQty !== undefined) {
    const n = Number(body.secondHandQty);
    if (!Number.isFinite(n) || n < 0) return apiError(400, "VALIDATION_FAILED", "secondHandQty must be non-negative");
  }

  // Same live-balance check as adding a line — a DRAFT transfer hasn't
  // posted to the ledger yet, so this checks the requested new value
  // directly against the current balance (not a delta off the old value).
  const newQty = body.qty !== undefined ? Number(body.qty) : Number(existing.Qty);
  const newSecondHandQty = body.secondHandQty !== undefined ? Number(body.secondHandQty) : Number(existing.SecondHandQty);
  if (newQty > 0) {
    const balance = await getStockBalance(header.SourceWarehouseCode, existing.ProductCode);
    if (balance.lt(newQty)) {
      return apiError(422, "INSUFFICIENT_STOCK", `สินค้าคงเหลือไม่พอ (คงเหลือ ${balance.toString()})`, {
        productCode: existing.ProductCode,
        warehouseCode: header.SourceWarehouseCode,
        available: balance.toString(),
        requested: newQty,
      });
    }
  }
  if (newSecondHandQty > 0) {
    const secondhand = await prisma.invSecondhandStock.findUnique({
      where: { WarehouseCode_ProductCode: { WarehouseCode: header.SourceWarehouseCode, ProductCode: existing.ProductCode } },
    });
    const available = secondhand?.Qty ?? 0;
    if (Number(available) < newSecondHandQty) {
      return apiError(422, "INSUFFICIENT_SECONDHAND_STOCK", `สินค้ามือสองคงเหลือไม่พอ (คงเหลือ ${available.toString()})`, {
        productCode: existing.ProductCode,
        warehouseCode: header.SourceWarehouseCode,
        available: available.toString(),
        requested: newSecondHandQty,
      });
    }
  }

  const updated = await prisma.invTransferDetail.update({
    where: { TransferDetailID: detailIdNum },
    data: {
      Qty: body.qty !== undefined ? Number(body.qty) : undefined,
      SecondHandQty: body.secondHandQty !== undefined ? Number(body.secondHandQty) : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_STOCK_TRANSFER_DETAIL", { targetTable: "inv_transfer_detail", targetId: detailId });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/inventory/stock-transfer-details/[detailId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_TRANSFER", "delete");
  if (denied) return denied;

  const { detailId } = await ctx.params;
  const detailIdNum = Number(detailId);
  if (!Number.isInteger(detailIdNum)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invTransferDetail.findUnique({ where: { TransferDetailID: detailIdNum } });
  if (!existing) return apiError(404, "STOCK_TRANSFER_DETAIL_NOT_FOUND");

  const header = await prisma.invTransferHeader.findUnique({ where: { TransferHeaderID: existing.TransferHeaderID } });
  if (!header) return apiError(404, "STOCK_TRANSFER_NOT_FOUND");
  if (header.Status === "APPROVED") {
    return apiError(409, "STOCK_TRANSFER_LOCKED", "An APPROVED transfer can no longer be edited", { status: header.Status });
  }

  await prisma.invTransferDetail.delete({ where: { TransferDetailID: detailIdNum } });
  await logAction(user.userId, "DELETE_STOCK_TRANSFER_DETAIL", { targetTable: "inv_transfer_detail", targetId: detailId });
  return apiSuccess({ ok: true });
}
