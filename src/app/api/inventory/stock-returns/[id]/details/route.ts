import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Unlike Issue, unitPrice is always manually entered here ("ใส่ยอดรับคืน
// ต่อหน่วยสินค้า") — a return's value doesn't have to match the original
// sale price, so there's no auto-fill for either regular or secondhand lines.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/inventory/stock-returns/[id]/details">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_RETURN", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const returnId = Number(id);
  if (!Number.isInteger(returnId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.invReturnHeader.findUnique({ where: { ReturnHeaderID: returnId } });
  if (!header) return apiError(404, "STOCK_RETURN_NOT_FOUND");
  if (header.Status === "APPROVED") {
    return apiError(409, "STOCK_RETURN_LOCKED", "An APPROVED return can no longer be edited", { status: header.Status });
  }

  let body: { productCode?: unknown; isSecondHand?: unknown; qty?: unknown; unitPrice?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const productCode = typeof body.productCode === "string" ? body.productCode.trim() : "";
  const isSecondHand = body.isSecondHand === true;
  const qty = Number(body.qty);
  const unitPrice = Number(body.unitPrice);
  if (!productCode || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
    return apiError(400, "INVALID_PARAMS", "productCode, qty (>0), and unitPrice (>=0) are required");
  }

  const product = await prisma.invProduct.findUnique({ where: { ProductCode: productCode } });
  if (!product) return apiError(404, "PRODUCT_NOT_FOUND", undefined, { productCode });

  const existingDetails = await prisma.invReturnDetail.findMany({
    where: { ReturnHeaderID: returnId },
    orderBy: { ReturnDetailID: "asc" },
    select: { ProductCode: true, IsSecondHand: true },
  });
  const existingIndex = existingDetails.findIndex((d) => d.ProductCode === productCode && d.IsSecondHand === isSecondHand);
  if (existingIndex !== -1) {
    return apiError(409, "PRODUCT_ALREADY_IN_RETURN", `มีรายการนี้แล้ว ในลำดับที่ ${existingIndex + 1}`, { productCode });
  }

  const created = await prisma.invReturnDetail.create({
    data: {
      ReturnHeaderID: returnId,
      ProductCode: productCode,
      IsSecondHand: isSecondHand,
      Qty: qty,
      UnitPrice: unitPrice,
      Amount: qty * unitPrice,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "ADD_STOCK_RETURN_DETAIL", {
    targetTable: "inv_return_detail",
    targetId: String(created.ReturnDetailID),
    detail: `Return ${returnId}, product ${productCode}`,
  });

  return apiSuccess({ ...created, Product: { ProductName: product.ProductName, UnitOfMeasure: product.UnitOfMeasure } }, 201);
}
