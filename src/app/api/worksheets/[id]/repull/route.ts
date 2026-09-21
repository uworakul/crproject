import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { repullWorksheetEmployees } from "@/lib/worksheet";

// "ดึงรายชื่อพนักงานอีกครั้ง" (2026-09-21) — re-runs the REGULAR employee
// auto-pull for an already-existing DRAFT worksheet (only ran once, at
// creation, otherwise). Additive only — never removes/overwrites an
// existing row.
export async function POST(_req: Request, ctx: RouteContext<"/api/worksheets/[id]/repull">) {
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

  const { added } = await repullWorksheetEmployees(worksheetId, header.SiteCode, header.WorkYear, header.WorkMonth, user.userId);

  await logAction(user.userId, "REPULL_WORKSHEET_EMPLOYEES", {
    targetTable: "trn_worksheet_detail",
    targetId: String(worksheetId),
    detail: `Added ${added} employee row(s)`,
  });

  return apiSuccess({ ok: true, added });
}
