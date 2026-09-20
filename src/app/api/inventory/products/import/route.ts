import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { parseProductWorkbook } from "@/lib/excel-reference";

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const deniedSave = await requirePermission(user, "PRODUCT", "save");
  if (deniedSave) return deniedSave;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request must be multipart/form-data");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return apiError(400, "INVALID_PARAMS", "file is required");
  const clearFirst = form.get("clearFirst") === "true";

  if (clearFirst) {
    const deniedDelete = await requirePermission(user, "PRODUCT", "delete");
    if (deniedDelete) return deniedDelete;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let rows: Awaited<ReturnType<typeof parseProductWorkbook>>;
  try {
    rows = await parseProductWorkbook(buffer);
  } catch {
    return apiError(400, "INVALID_PARAMS", "Could not read the uploaded file as an Excel workbook");
  }
  if (rows.length === 0) return apiError(400, "INVALID_PARAMS", "No valid rows found (expected code + name columns)");

  // Reject unknown category codes up front rather than silently dropping or
  // auto-creating them — a typo'd category code should surface as an error,
  // not quietly leave the product uncategorized.
  const usedCategoryCodes = [...new Set(rows.map((r) => r.categoryCode).filter((c): c is string => c !== null))];
  if (usedCategoryCodes.length > 0) {
    const knownCategories = await prisma.invProductCategory.findMany({
      where: { CategoryCode: { in: usedCategoryCodes } },
      select: { CategoryCode: true },
    });
    const known = new Set(knownCategories.map((c) => c.CategoryCode));
    const unknown = usedCategoryCodes.filter((c) => !known.has(c));
    if (unknown.length > 0) {
      return apiError(400, "CATEGORY_NOT_FOUND", `Unknown category code(s): ${unknown.join(", ")} — create them in the หมวดหมู่ tab first`, {
        unknownCategoryCodes: unknown,
      });
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (clearFirst) {
        await tx.invProduct.deleteMany();
      }

      let created = 0;
      let updated = 0;
      for (const row of rows) {
        const existing = await tx.invProduct.findUnique({ where: { ProductCode: row.code } });
        await tx.invProduct.upsert({
          where: { ProductCode: row.code },
          create: {
            ProductCode: row.code,
            ProductName: row.name,
            CategoryCode: row.categoryCode,
            UnitCost: row.unitCost,
            UnitPrice: row.unitPrice,
            CreatedBy: user.userId,
          },
          update: {
            ProductName: row.name,
            CategoryCode: row.categoryCode,
            UnitCost: row.unitCost,
            UnitPrice: row.unitPrice,
            UpdatedBy: user.userId,
            UpdatedDate: new Date(),
          },
        });
        if (existing) updated++;
        else created++;
      }
      return { created, updated };
    });

    await logAction(user.userId, "IMPORT_PRODUCTS", {
      targetTable: "inv_product",
      detail: `clearFirst=${clearFirst}, created=${result.created}, updated=${result.updated}`,
    });
    return apiSuccess({ ok: true, ...result });
  } catch {
    return apiError(409, "PRODUCT_IN_USE", "Could not clear existing products — one or more are linked to stock movements and cannot be removed");
  }
}
