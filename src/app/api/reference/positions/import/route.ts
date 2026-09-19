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
  const deniedSave = await requirePermission(user, "REFERENCE", "save");
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
    const deniedDelete = await requirePermission(user, "REFERENCE", "delete");
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
        await tx.refPosition.deleteMany();
      }

      let created = 0;
      let updated = 0;
      for (const row of rows) {
        const existing = await tx.refPosition.findUnique({ where: { PositionCode: row.code } });
        await tx.refPosition.upsert({
          where: { PositionCode: row.code },
          create: { PositionCode: row.code, PositionName: row.name, CreatedBy: user.userId },
          update: { PositionName: row.name, UpdatedBy: user.userId, UpdatedDate: new Date() },
        });
        if (existing) updated++;
        else created++;
      }
      return { created, updated };
    });

    await logAction(user.userId, "IMPORT_POSITIONS", {
      targetTable: "ref_position",
      detail: `clearFirst=${clearFirst}, created=${result.created}, updated=${result.updated}`,
    });
    return apiSuccess({ ok: true, ...result });
  } catch {
    return apiError(409, "POSITION_IN_USE", "Could not clear existing positions — one or more are linked to employees and cannot be removed");
  }
}
