import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Gated under PRODUCT (not a separate DocumentType) — this table only
// exists as a dropdown source for inv_product.CategoryCode, same tight
// coupling as ref_deduction_rate's fixed rows had no permission of its own.
export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PRODUCT", "read");
  if (denied) return denied;

  const categories = await prisma.invProductCategory.findMany({ orderBy: { CategoryCode: "asc" } });
  return apiSuccess(categories);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PRODUCT", "save");
  if (denied) return denied;

  let body: { categoryCode?: unknown; categoryName?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const categoryCode = typeof body.categoryCode === "string" ? body.categoryCode.trim() : "";
  const categoryName = typeof body.categoryName === "string" ? body.categoryName.trim() : "";
  if (!categoryCode || !categoryName) return apiError(400, "INVALID_PARAMS", "categoryCode and categoryName are required");

  const existing = await prisma.invProductCategory.findUnique({ where: { CategoryCode: categoryCode } });
  if (existing) return apiError(409, "CATEGORY_ALREADY_EXISTS", undefined, { categoryCode });

  const created = await prisma.invProductCategory.create({
    data: { CategoryCode: categoryCode, CategoryName: categoryName, CreatedBy: user.userId },
  });
  await logAction(user.userId, "CREATE_PRODUCT_CATEGORY", { targetTable: "inv_product_category", targetId: categoryCode });
  return apiSuccess(created, 201);
}
