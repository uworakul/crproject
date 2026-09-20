import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getStockBalance } from "@/lib/inventory";

// Regular ("สินค้า") lines always price from inv_product.UnitPrice — the
// client-supplied unitPrice is ignored for those and re-derived here, so
// the line always reflects the product's current selling price. Secondhand
// lines require a manually entered unitPrice (no catalog price to draw on).
export async function POST(request: NextRequest, ctx: RouteContext<"/api/inventory/stock-issues/[id]/details">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_ISSUE", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const issueId = Number(id);
  if (!Number.isInteger(issueId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.invIssueHeader.findUnique({ where: { IssueHeaderID: issueId } });
  if (!header) return apiError(404, "STOCK_ISSUE_NOT_FOUND");
  if (header.Status === "APPROVED") {
    return apiError(409, "STOCK_ISSUE_LOCKED", "An APPROVED issue can no longer be edited", { status: header.Status });
  }

  let body: { productCode?: unknown; isSecondHand?: unknown; qty?: unknown; unitPrice?: unknown; isWelfare?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const productCode = typeof body.productCode === "string" ? body.productCode.trim() : "";
  const qty = Number(body.qty);
  const isSecondHand = body.isSecondHand === true;
  const isWelfare = body.isWelfare === true;
  if (!productCode || !Number.isFinite(qty) || qty <= 0) {
    return apiError(400, "INVALID_PARAMS", "productCode and qty (>0) are required");
  }

  const product = await prisma.invProduct.findUnique({ where: { ProductCode: productCode } });
  if (!product) return apiError(404, "PRODUCT_NOT_FOUND", undefined, { productCode });

  // A welfare (free) line never has a selling price, regardless of kind —
  // the client-supplied unitPrice is ignored and no price is required.
  let unitPrice: number;
  if (isWelfare) {
    unitPrice = 0;
  } else if (isSecondHand) {
    unitPrice = Number(body.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return apiError(400, "VALIDATION_FAILED", "unitPrice is required (>=0) for a secondhand line");
    }
  } else {
    unitPrice = Number(product.UnitPrice);
  }

  // Same product+kind can appear twice — once sold, once given away as
  // สวัสดิการ — so the duplicate key includes IsWelfare, not just
  // ProductCode+IsSecondHand.
  const existingDetails = await prisma.invIssueDetail.findMany({
    where: { IssueHeaderID: issueId },
    orderBy: { IssueDetailID: "asc" },
    select: { ProductCode: true, IsSecondHand: true, IsWelfare: true },
  });
  const existingIndex = existingDetails.findIndex((d) => d.ProductCode === productCode && d.IsSecondHand === isSecondHand && d.IsWelfare === isWelfare);
  if (existingIndex !== -1) {
    return apiError(409, "PRODUCT_ALREADY_IN_ISSUE", `มีรายการนี้แล้ว ในลำดับที่ ${existingIndex + 1}`, { productCode });
  }

  // Check against the issuing warehouse's live balance up front (not just
  // at approve time) so the person entering the sale finds out immediately.
  if (isSecondHand) {
    const secondhand = await prisma.invSecondhandStock.findUnique({
      where: { WarehouseCode_ProductCode: { WarehouseCode: header.WarehouseCode, ProductCode: productCode } },
    });
    const available = secondhand?.Qty ?? 0;
    if (Number(available) < qty) {
      return apiError(422, "INSUFFICIENT_SECONDHAND_STOCK", `สินค้ามือสองคงเหลือไม่พอ (คงเหลือ ${available.toString()})`, {
        productCode,
        warehouseCode: header.WarehouseCode,
        available: available.toString(),
        requested: qty,
      });
    }
  } else {
    const balance = await getStockBalance(header.WarehouseCode, productCode);
    if (balance.lt(qty)) {
      return apiError(422, "INSUFFICIENT_STOCK", `สินค้าคงเหลือไม่พอ (คงเหลือ ${balance.toString()})`, {
        productCode,
        warehouseCode: header.WarehouseCode,
        available: balance.toString(),
        requested: qty,
      });
    }
  }

  const created = await prisma.invIssueDetail.create({
    data: {
      IssueHeaderID: issueId,
      ProductCode: productCode,
      IsSecondHand: isSecondHand,
      Qty: qty,
      UnitPrice: unitPrice,
      Amount: qty * unitPrice,
      IsWelfare: isWelfare,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "ADD_STOCK_ISSUE_DETAIL", {
    targetTable: "inv_issue_detail",
    targetId: String(created.IssueDetailID),
    detail: `Issue ${issueId}, product ${productCode}`,
  });

  return apiSuccess({ ...created, Product: { ProductName: product.ProductName, UnitOfMeasure: product.UnitOfMeasure, UnitPrice: product.UnitPrice } }, 201);
}
