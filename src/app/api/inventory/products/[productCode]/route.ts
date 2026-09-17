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

  let body: { productName?: unknown; category?: unknown; unitCost?: unknown; unitPrice?: unknown; isActive?: unknown };
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

  const updated = await prisma.invProduct.update({
    where: { ProductCode: productCode },
    data: {
      ProductName: productName,
      Category: typeof body.category === "string" && body.category.trim() ? body.category.trim() : null,
      UnitCost: unitCost,
      UnitPrice: unitPrice,
      IsActive: typeof body.isActive === "boolean" ? body.isActive : existing.IsActive,
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

  const updated = await prisma.invProduct.update({ where: { ProductCode: productCode }, data: { IsActive: false } });
  await logAction(user.userId, "DEACTIVATE_PRODUCT", { targetTable: "inv_product", targetId: productCode });
  return apiSuccess(updated);
}
