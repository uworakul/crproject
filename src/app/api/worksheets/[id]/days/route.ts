import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { saveWorksheetDays, type DayInput } from "@/lib/worksheet";

// Bulk save for the whole grid in one call — the mockup edits many cells
// before saving, not one request per cell.
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/worksheets/[id]/days">) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }
  if (!Array.isArray(body)) {
    return apiError(400, "INVALID_PARAMS", "Request body must be an array of day entries");
  }
  const entries = body as DayInput[];

  const result = await saveWorksheetDays(worksheetId, header.WorkYear, header.WorkMonth, entries, user.userId);
  if (!result.ok) {
    return apiError(400, result.error.reason, result.error.message, result.error.detail);
  }

  await logAction(user.userId, "SAVE_WORKSHEET_DAYS", {
    targetTable: "trn_worksheet_daily",
    targetId: String(worksheetId),
    detail: `${entries.length} cell(s)`,
  });

  return apiSuccess({ ok: true, count: entries.length });
}
