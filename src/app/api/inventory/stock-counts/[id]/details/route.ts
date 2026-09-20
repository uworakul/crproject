import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Add one product line to a stock count document — allowed until the header
// is APPROVED, same "เพิ่ม/แก้ไข/ลบรายการได้ จนกว่าจะอนุมัติ" rule as the
// Request & Approve module's detail lines.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/inventory/stock-counts/[id]/details">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_COUNT", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const stockCountId = Number(id);
  if (!Number.isInteger(stockCountId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.invStockCountHeader.findUnique({ where: { StockCountHeaderID: stockCountId } });
  if (!header) return apiError(404, "STOCK_COUNT_NOT_FOUND");
  if (header.Status === "APPROVED") {
    return apiError(409, "STOCK_COUNT_LOCKED", "An APPROVED stock count can no longer be edited", { status: header.Status });
  }

  let body: { productCode?: unknown; countedQty?: unknown; countedSecondHandQty?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const productCode = typeof body.productCode === "string" ? body.productCode.trim() : "";
  const countedQty = Number(body.countedQty);
  const countedSecondHandQty = Number(body.countedSecondHandQty ?? 0);
  if (!productCode || !Number.isFinite(countedQty) || countedQty < 0 || !Number.isFinite(countedSecondHandQty) || countedSecondHandQty < 0) {
    return apiError(400, "INVALID_PARAMS", "productCode, countedQty (>=0), and countedSecondHandQty (>=0) are required");
  }

  const product = await prisma.invProduct.findUnique({ where: { ProductCode: productCode } });
  if (!product) return apiError(404, "PRODUCT_NOT_FOUND", undefined, { productCode });

  // Ordered the same way the detail page renders rows (StockCountDetailID
  // asc, i.e. insertion order) so a reported duplicate position matches
  // what the user sees on screen — same convention as Request details.
  const existingDetails = await prisma.invStockCountDetail.findMany({
    where: { StockCountHeaderID: stockCountId },
    orderBy: { StockCountDetailID: "asc" },
    select: { ProductCode: true },
  });
  const existingIndex = existingDetails.findIndex((d) => d.ProductCode === productCode);
  if (existingIndex !== -1) {
    return apiError(409, "PRODUCT_ALREADY_IN_STOCK_COUNT", `มีรายการนี้แล้ว ในลำดับที่ ${existingIndex + 1}`, { productCode });
  }

  const created = await prisma.invStockCountDetail.create({
    data: {
      StockCountHeaderID: stockCountId,
      ProductCode: productCode,
      CountedQty: countedQty,
      CountedSecondHandQty: countedSecondHandQty,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "ADD_STOCK_COUNT_DETAIL", {
    targetTable: "inv_stock_count_detail",
    targetId: String(created.StockCountDetailID),
    detail: `Stock count ${stockCountId}, product ${productCode}`,
  });

  return apiSuccess({ ...created, Product: { ProductName: product.ProductName, UnitOfMeasure: product.UnitOfMeasure } }, 201);
}
