import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { unapproveWorksheet } from "@/lib/worksheet";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function POST(_req: Request, ctx: RouteContext<"/api/worksheets/[id]/unapprove">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const worksheetId = Number(id);
  if (!Number.isInteger(worksheetId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.trnWorksheetHeader.findUnique({ where: { WorksheetID: worksheetId } });
  if (!header) return apiError(404, "WORKSHEET_NOT_FOUND");

  // Same permission as approve/reject — undoing an approval is just as
  // privileged an action as making one.
  const denied = !(await hasPermission(user, "WORKSHEET", "approve", header.SiteCode));
  if (denied) return apiError(403, "FORBIDDEN", "Missing 'approve' permission on 'WORKSHEET' for this site");

  if (header.Status !== "APPROVED") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only an APPROVED worksheet can be unapproved", {
      currentStatus: header.Status,
    });
  }

  const result = await unapproveWorksheet(worksheetId, user.userId);
  if (!result.ok) {
    if (result.error.reason === "PERIOD_LOCKED") {
      return apiError(409, "PERIOD_LOCKED", "งวดที่เกี่ยวข้องถูกล็อกแล้ว ไม่สามารถยกเลิกการอนุมัติได้", { ...result.error });
    }
    return apiError(422, "UNAPPROVE_FAILED", undefined, { ...result.error });
  }

  await logAction(user.userId, "UNAPPROVE_WORKSHEET", { targetTable: "trn_worksheet_header", targetId: String(worksheetId) });

  return apiSuccess({ ok: true });
}
