import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { parseTwoColumnWorkbook } from "@/lib/excel-reference";

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const deniedSave = await requirePermission(user, "SITE", "save");
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
    const deniedDelete = await requirePermission(user, "SITE", "delete");
    if (deniedDelete) return deniedDelete;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let rows: { code: string; name: string }[];
  try {
    rows = await parseTwoColumnWorkbook(buffer);
  } catch {
    return apiError(400, "INVALID_PARAMS", "Could not read the uploaded file as an Excel workbook");
  }
  if (rows.length === 0) return apiError(400, "INVALID_PARAMS", "No valid rows found (expected code + name columns)");

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (clearFirst) {
        await tx.mstSite.deleteMany();
      }

      let created = 0;
      let updated = 0;
      for (const row of rows) {
        const existing = await tx.mstSite.findUnique({ where: { SiteCode: row.code } });
        await tx.mstSite.upsert({
          where: { SiteCode: row.code },
          create: { SiteCode: row.code, SiteName: row.name, CreatedBy: user.userId },
          update: { SiteName: row.name, UpdatedBy: user.userId, UpdatedDate: new Date() },
        });
        if (existing) updated++;
        else created++;
      }
      return { created, updated };
    });

    await logAction(user.userId, "IMPORT_SITES", {
      targetTable: "mst_site",
      detail: `clearFirst=${clearFirst}, created=${result.created}, updated=${result.updated}`,
    });
    return apiSuccess({ ok: true, ...result });
  } catch {
    return apiError(409, "SITE_IN_USE", "Could not clear existing sites — one or more are linked to users, employees, or worksheets and cannot be removed");
  }
}
