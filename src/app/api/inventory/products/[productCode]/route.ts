import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/inventory/products/[productCode]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PRODUCT", "read");
  if (denied) return denied;

  const { productCode } = await ctx.params;
  const product = await prisma.invProduct.findUnique({ where: { ProductCode: productCode } });
  if (!product) return apiError(404, "PRODUCT_NOT_FOUND");
  return apiSuccess(product);
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/inventory/products/[productCode]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PRODUCT", "save");
  if (denied) return denied;

  const { productCode } = await ctx.params;
  const existing = await prisma.invProduct.findUnique({ where: { ProductCode: productCode } });
  if (!existing) return apiError(404, "PRODUCT_NOT_FOUND");

  let body: { productName?: unknown; categoryCode?: unknown; unitCost?: unknown; unitPrice?: unknown; isActive?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const productName = typeof body.productName === "string" ? body.productName.trim() : "";
  if (!productName) return apiError(400, "INVALID_PARAMS", "productName is required");

  const unitCost = Number(body.unitCost ?? existing.UnitCost);
  const unitPrice = Number(body.unitPrice ?? existing.UnitPrice);
  if (!Number.isFinite(unitCost) || unitCost < 0) return apiError(400, "VALIDATION_FAILED", "unitCost must be a non-negative number");
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return apiError(400, "VALIDATION_FAILED", "unitPrice must be a non-negative number");

  const categoryCode = typeof body.categoryCode === "string" && body.categoryCode.trim() ? body.categoryCode.trim() : null;
  if (categoryCode) {
    const category = await prisma.invProductCategory.findUnique({ where: { CategoryCode: categoryCode } });
    if (!category) return apiError(404, "CATEGORY_NOT_FOUND", undefined, { categoryCode });
  }

  const updated = await prisma.invProduct.update({
    where: { ProductCode: productCode },
    data: {
      ProductName: productName,
      CategoryCode: categoryCode,
      UnitCost: unitCost,
      UnitPrice: unitPrice,
      IsActive: typeof body.isActive === "boolean" ? body.isActive : existing.IsActive,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_PRODUCT", { targetTable: "inv_product", targetId: productCode });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/inventory/products/[productCode]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PRODUCT", "delete");
  if (denied) return denied;

  const { productCode } = await ctx.params;
  const existing = await prisma.invProduct.findUnique({ where: { ProductCode: productCode } });
  if (!existing) return apiError(404, "PRODUCT_NOT_FOUND");

  try {
    await prisma.invProduct.delete({ where: { ProductCode: productCode } });
  } catch {
    return apiError(409, "PRODUCT_IN_USE", "This product is linked to one or more stock movements and cannot be deleted");
  }

  await logAction(user.userId, "DELETE_PRODUCT", { targetTable: "inv_product", targetId: productCode });
  return apiSuccess({ ok: true });
}
