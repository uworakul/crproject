import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PRODUCT", "read");
  if (denied) return denied;

  const products = await prisma.invProduct.findMany({ orderBy: { ProductCode: "asc" } });
  return apiSuccess(products);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PRODUCT", "save");
  if (denied) return denied;

  let body: { productCode?: unknown; productName?: unknown; categoryCode?: unknown; unitOfMeasure?: unknown; unitCost?: unknown; unitPrice?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const productCode = typeof body.productCode === "string" ? body.productCode.trim() : "";
  const productName = typeof body.productName === "string" ? body.productName.trim() : "";
  if (!productCode || !productName) return apiError(400, "INVALID_PARAMS", "productCode and productName are required");

  const unitCost = Number(body.unitCost ?? 0);
  const unitPrice = Number(body.unitPrice ?? 0);
  if (!Number.isFinite(unitCost) || unitCost < 0) return apiError(400, "VALIDATION_FAILED", "unitCost must be a non-negative number");
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return apiError(400, "VALIDATION_FAILED", "unitPrice must be a non-negative number");

  const categoryCode = typeof body.categoryCode === "string" && body.categoryCode.trim() ? body.categoryCode.trim() : null;
  if (categoryCode) {
    const category = await prisma.invProductCategory.findUnique({ where: { CategoryCode: categoryCode } });
    if (!category) return apiError(404, "CATEGORY_NOT_FOUND", undefined, { categoryCode });
  }
  const unitOfMeasure = typeof body.unitOfMeasure === "string" && body.unitOfMeasure.trim() ? body.unitOfMeasure.trim() : null;

  const existing = await prisma.invProduct.findUnique({ where: { ProductCode: productCode } });
  if (existing) return apiError(409, "PRODUCT_ALREADY_EXISTS", undefined, { productCode });

  const created = await prisma.invProduct.create({
    data: {
      ProductCode: productCode,
      ProductName: productName,
      CategoryCode: categoryCode,
      UnitOfMeasure: unitOfMeasure,
      UnitCost: unitCost,
      UnitPrice: unitPrice,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "CREATE_PRODUCT", { targetTable: "inv_product", targetId: productCode });
  return apiSuccess(created, 201);
}
