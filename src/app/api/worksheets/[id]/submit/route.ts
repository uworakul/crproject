import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function POST(_req: Request, ctx: RouteContext<"/api/worksheets/[id]/submit">) {
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
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a DRAFT worksheet can be submitted", {
      currentStatus: header.Status,
    });
  }

  await prisma.trnWorksheetHeader.update({
    where: { WorksheetID: worksheetId },
    data: { Status: "SUBMITTED", SubmittedBy: user.userId, SubmittedDate: new Date() },
  });

  await logAction(user.userId, "SUBMIT_WORKSHEET", { targetTable: "trn_worksheet_header", targetId: String(worksheetId) });

  return apiSuccess({ ok: true });
}
