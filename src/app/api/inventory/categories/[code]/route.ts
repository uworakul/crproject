import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/inventory/categories/[code]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PRODUCT", "save");
  if (denied) return denied;

  const { code } = await ctx.params;
  const existing = await prisma.invProductCategory.findUnique({ where: { CategoryCode: code } });
  if (!existing) return apiError(404, "CATEGORY_NOT_FOUND");

  let body: { categoryName?: unknown; isActive?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const updated = await prisma.invProductCategory.update({
    where: { CategoryCode: code },
    data: {
      CategoryName: typeof body.categoryName === "string" ? body.categoryName.trim() : undefined,
      IsActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_PRODUCT_CATEGORY", { targetTable: "inv_product_category", targetId: code });
  return apiSuccess(updated);
}

// Hard delete — inv_product.CategoryCode has a NO ACTION FK to this table,
// caught the same way as Bank/Department/Position/Site.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/inventory/categories/[code]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PRODUCT", "delete");
  if (denied) return denied;

  const { code } = await ctx.params;
  const existing = await prisma.invProductCategory.findUnique({ where: { CategoryCode: code } });
  if (!existing) return apiError(404, "CATEGORY_NOT_FOUND");

  try {
    await prisma.invProductCategory.delete({ where: { CategoryCode: code } });
  } catch {
    return apiError(409, "CATEGORY_IN_USE", "This category is linked to one or more products and cannot be deleted");
  }

  await logAction(user.userId, "DELETE_PRODUCT_CATEGORY", { targetTable: "inv_product_category", targetId: code });
  return apiSuccess({ ok: true });
}
