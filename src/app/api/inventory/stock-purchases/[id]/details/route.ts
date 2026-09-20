import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Add one product line to a purchase document — allowed until the header is
// APPROVED, same rule as the ตรวจนับสต๊อก module's detail lines.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/inventory/stock-purchases/[id]/details">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_PURCHASE", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const purchaseId = Number(id);
  if (!Number.isInteger(purchaseId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.invPurchaseHeader.findUnique({ where: { PurchaseHeaderID: purchaseId } });
  if (!header) return apiError(404, "STOCK_PURCHASE_NOT_FOUND");
  if (header.Status === "APPROVED") {
    return apiError(409, "STOCK_PURCHASE_LOCKED", "An APPROVED purchase can no longer be edited", { status: header.Status });
  }

  let body: { productCode?: unknown; qty?: unknown; unitPrice?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const productCode = typeof body.productCode === "string" ? body.productCode.trim() : "";
  const qty = Number(body.qty);
  const unitPrice = Number(body.unitPrice);
  if (!productCode || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
    return apiError(400, "INVALID_PARAMS", "productCode, qty (>0), and unitPrice (>=0) are required");
  }

  const product = await prisma.invProduct.findUnique({ where: { ProductCode: productCode } });
  if (!product) return apiError(404, "PRODUCT_NOT_FOUND", undefined, { productCode });

  const existingDetails = await prisma.invPurchaseDetail.findMany({
    where: { PurchaseHeaderID: purchaseId },
    orderBy: { PurchaseDetailID: "asc" },
    select: { ProductCode: true },
  });
  const existingIndex = existingDetails.findIndex((d) => d.ProductCode === productCode);
  if (existingIndex !== -1) {
    return apiError(409, "PRODUCT_ALREADY_IN_PURCHASE", `มีรายการนี้แล้ว ในลำดับที่ ${existingIndex + 1}`, { productCode });
  }

  const created = await prisma.invPurchaseDetail.create({
    data: {
      PurchaseHeaderID: purchaseId,
      ProductCode: productCode,
      Qty: qty,
      UnitPrice: unitPrice,
      Amount: qty * unitPrice,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "ADD_STOCK_PURCHASE_DETAIL", {
    targetTable: "inv_purchase_detail",
    targetId: String(created.PurchaseDetailID),
    detail: `Purchase ${purchaseId}, product ${productCode}`,
  });

  return apiSuccess({ ...created, Product: { ProductName: product.ProductName, UnitOfMeasure: product.UnitOfMeasure, UnitCost: product.UnitCost } }, 201);
}
