import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getStockBalance } from "@/lib/inventory";

// Flat endpoint — see stock-count-details/[detailId]/route.ts. IsSecondHand
// isn't editable here (changing a line's price source after the fact is
// ambiguous) — delete and re-add if the line type needs to change.
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/inventory/stock-issue-details/[detailId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_ISSUE", "save");
  if (denied) return denied;

  const { detailId } = await ctx.params;
  const detailIdNum = Number(detailId);
  if (!Number.isInteger(detailIdNum)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invIssueDetail.findUnique({ where: { IssueDetailID: detailIdNum } });
  if (!existing) return apiError(404, "STOCK_ISSUE_DETAIL_NOT_FOUND");

  const header = await prisma.invIssueHeader.findUnique({ where: { IssueHeaderID: existing.IssueHeaderID } });
  if (!header) return apiError(404, "STOCK_ISSUE_NOT_FOUND");
  if (header.Status === "APPROVED") {
    return apiError(409, "STOCK_ISSUE_LOCKED", "An APPROVED issue can no longer be edited", { status: header.Status });
  }

  let body: { qty?: unknown; unitPrice?: unknown; isWelfare?: unknown };
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
  const newIsWelfare = typeof body.isWelfare === "boolean" ? body.isWelfare : existing.IsWelfare;

  // Same product+kind can appear twice (sold vs. สวัสดิการ), so toggling
  // IsWelfare on this line could collide with another existing line that's
  // otherwise identical — check for that the same way adding a line does.
  if (typeof body.isWelfare === "boolean" && body.isWelfare !== existing.IsWelfare) {
    const siblings = await prisma.invIssueDetail.findMany({
      where: { IssueHeaderID: existing.IssueHeaderID, IssueDetailID: { not: detailIdNum } },
      orderBy: { IssueDetailID: "asc" },
      select: { IssueDetailID: true, ProductCode: true, IsSecondHand: true, IsWelfare: true },
    });
    const clashIndex = siblings.findIndex((d) => d.ProductCode === existing.ProductCode && d.IsSecondHand === existing.IsSecondHand && d.IsWelfare === newIsWelfare);
    if (clashIndex !== -1) {
      return apiError(409, "PRODUCT_ALREADY_IN_ISSUE", `มีรายการนี้แล้ว ในลำดับที่ ${clashIndex + 1}`, { productCode: existing.ProductCode });
    }
  }

  // A welfare (free) line never has a price. Otherwise: regular lines
  // always re-derive from the product's current selling price; secondhand
  // lines keep a manually entered price (required if it was welfare a
  // moment ago and has no price to fall back on).
  let resolvedUnitPrice: number;
  if (newIsWelfare) {
    resolvedUnitPrice = 0;
  } else if (existing.IsSecondHand) {
    if (body.unitPrice !== undefined) {
      resolvedUnitPrice = Number(body.unitPrice);
    } else if (existing.IsWelfare) {
      return apiError(400, "VALIDATION_FAILED", "unitPrice is required when removing สวัสดิการ from a secondhand line");
    } else {
      resolvedUnitPrice = Number(existing.UnitPrice);
    }
  } else {
    const product = await prisma.invProduct.findUnique({ where: { ProductCode: existing.ProductCode }, select: { UnitPrice: true } });
    resolvedUnitPrice = product ? Number(product.UnitPrice) : Number(existing.UnitPrice);
  }

  // Same live-balance check as adding a line — a DRAFT issue hasn't posted
  // to the ledger yet, so this checks the requested new qty directly
  // against the current balance (not a delta off the old value).
  if (body.qty !== undefined) {
    if (existing.IsSecondHand) {
      const secondhand = await prisma.invSecondhandStock.findUnique({
        where: { WarehouseCode_ProductCode: { WarehouseCode: header.WarehouseCode, ProductCode: existing.ProductCode } },
      });
      const available = secondhand?.Qty ?? 0;
      if (Number(available) < qty) {
        return apiError(422, "INSUFFICIENT_SECONDHAND_STOCK", `สินค้ามือสองคงเหลือไม่พอ (คงเหลือ ${available.toString()})`, {
          productCode: existing.ProductCode,
          warehouseCode: header.WarehouseCode,
          available: available.toString(),
          requested: qty,
        });
      }
    } else {
      const balance = await getStockBalance(header.WarehouseCode, existing.ProductCode);
      if (balance.lt(qty)) {
        return apiError(422, "INSUFFICIENT_STOCK", `สินค้าคงเหลือไม่พอ (คงเหลือ ${balance.toString()})`, {
          productCode: existing.ProductCode,
          warehouseCode: header.WarehouseCode,
          available: balance.toString(),
          requested: qty,
        });
      }
    }
  }

  const updated = await prisma.invIssueDetail.update({
    where: { IssueDetailID: detailIdNum },
    data: {
      Qty: qty,
      UnitPrice: resolvedUnitPrice,
      Amount: qty * resolvedUnitPrice,
      IsWelfare: typeof body.isWelfare === "boolean" ? body.isWelfare : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_STOCK_ISSUE_DETAIL", { targetTable: "inv_issue_detail", targetId: detailId });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/inventory/stock-issue-details/[detailId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_ISSUE", "delete");
  if (denied) return denied;

  const { detailId } = await ctx.params;
  const detailIdNum = Number(detailId);
  if (!Number.isInteger(detailIdNum)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invIssueDetail.findUnique({ where: { IssueDetailID: detailIdNum } });
  if (!existing) return apiError(404, "STOCK_ISSUE_DETAIL_NOT_FOUND");

  const header = await prisma.invIssueHeader.findUnique({ where: { IssueHeaderID: existing.IssueHeaderID } });
  if (!header) return apiError(404, "STOCK_ISSUE_NOT_FOUND");
  if (header.Status === "APPROVED") {
    return apiError(409, "STOCK_ISSUE_LOCKED", "An APPROVED issue can no longer be edited", { status: header.Status });
  }

  await prisma.invIssueDetail.delete({ where: { IssueDetailID: detailIdNum } });
  await logAction(user.userId, "DELETE_STOCK_ISSUE_DETAIL", { targetTable: "inv_issue_detail", targetId: detailId });
  return apiSuccess({ ok: true });
}
