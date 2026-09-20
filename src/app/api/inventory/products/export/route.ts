import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError } from "@/lib/api-response";
import { buildProductWorkbook } from "@/lib/excel-reference";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PRODUCT", "read");
  if (denied) return denied;

  const products = await prisma.invProduct.findMany({ orderBy: { ProductCode: "asc" } });
  const buffer = await buildProductWorkbook(
    products.map((p) => ({
      code: p.ProductCode,
      name: p.ProductName,
      categoryCode: p.CategoryCode,
      unitCost: Number(p.UnitCost),
      unitPrice: Number(p.UnitPrice),
    })),
  );

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="products.xlsx"',
    },
  });
}
