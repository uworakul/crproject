import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { saveWorksheetDays, type DayInput } from "@/lib/worksheet";
import { parseWorksheetWorkbook } from "@/lib/excel-reference";

// 2026-09-22 — fills in attendance codes for employees already ON this
// worksheet from an uploaded Excel file (meant for the export/edit/re-import
// round trip). Deliberately does NOT add/remove employees from the sheet —
// membership (REGULAR auto-pull, SPARE add) stays a separate, dedicated flow
// with its own position/rate-resolution logic that an Excel cell has no safe
// way to drive. Same DRAFT-only / permission rule as the grid's own
// "บันทึก" button (PUT .../days), since this writes to the exact same table
// through the exact same saveWorksheetDays() helper.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/worksheets/[id]/import">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const worksheetId = Number(id);
  if (!Number.isInteger(worksheetId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.trnWorksheetHeader.findUnique({ where: { WorksheetID: worksheetId } });
  if (!header) return apiError(404, "WORKSHEET_NOT_FOUND");

  const denied = !(await hasPermission(user, "WORKSHEET", "save", header.SiteCode));
  if (denied) return apiError(403, "FORBIDDEN", "Missing 'save' permission on 'WORKSHEET' for this site");

  if (header.Status !== "DRAFT") {
    return apiError(409, "WORKSHEET_LOCKED", "Only a DRAFT worksheet can be edited", { status: header.Status });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request must be multipart/form-data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return apiError(400, "INVALID_PARAMS", "file is required");

  const daysInMonth = new Date(header.WorkYear, header.WorkMonth, 0).getDate();
  const buffer = Buffer.from(await file.arrayBuffer());
  let rows: Awaited<ReturnType<typeof parseWorksheetWorkbook>>;
  try {
    rows = await parseWorksheetWorkbook(buffer, daysInMonth);
  } catch {
    return apiError(400, "INVALID_PARAMS", "Could not read the uploaded file as an Excel workbook");
  }
  if (rows.length === 0) return apiError(400, "INVALID_PARAMS", "No valid rows found (expected a รหัสพนักงาน column in column A)");

  const details = await prisma.trnWorksheetDetail.findMany({ where: { WorksheetID: worksheetId }, select: { WorksheetDetailID: true, EmpCode: true } });
  const detailIdByEmpCode = new Map(details.map((d) => [d.EmpCode, d.WorksheetDetailID]));

  // All-or-nothing on unknown employees, same rationale as product import
  // rejecting an unknown categoryCode outright — silently skipping a
  // mistyped/former employee's row would make the user think their edits
  // were applied when they weren't.
  const unknownEmpCodes = [...new Set(rows.filter((r) => !detailIdByEmpCode.has(r.empCode)).map((r) => r.empCode))];
  if (unknownEmpCodes.length > 0) {
    return apiError(400, "VALIDATION_FAILED", "Some employee codes in the file are not on this worksheet", { unknownEmpCodes });
  }

  const entries: DayInput[] = [];
  for (const row of rows) {
    const worksheetDetailId = detailIdByEmpCode.get(row.empCode)!;
    for (const [day, attendCode] of row.days) {
      entries.push({ worksheetDetailId, day, attendCode });
    }
  }

  const result = await saveWorksheetDays(worksheetId, header.WorkYear, header.WorkMonth, entries, user.userId);
  if (!result.ok) {
    return apiError(400, result.error.reason, result.error.message, result.error.detail);
  }

  await logAction(user.userId, "IMPORT_WORKSHEET_DAYS", {
    targetTable: "trn_worksheet_daily",
    targetId: String(worksheetId),
    detail: `${rows.length} employee row(s), ${entries.length} cell(s)`,
  });

  return apiSuccess({ ok: true, employees: rows.length, count: entries.length });
}
