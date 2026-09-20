import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError } from "@/lib/api-response";
import { buildTwoColumnWorkbook } from "@/lib/excel-reference";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PRODUCT", "read");
  if (denied) return denied;

  const categories = await prisma.invProductCategory.findMany({ orderBy: { CategoryCode: "asc" } });
  const buffer = await buildTwoColumnWorkbook(
    "หมวดหมู่",
    "รหัสหมวดหมู่",
    "ชื่อหมวดหมู่",
    categories.map((c) => ({ code: c.CategoryCode, name: c.CategoryName })),
  );

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="product-categories.xlsx"',
    },
  });
}
