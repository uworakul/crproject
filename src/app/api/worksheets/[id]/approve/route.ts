import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { approveWorksheet } from "@/lib/worksheet";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function POST(_req: Request, ctx: RouteContext<"/api/worksheets/[id]/approve">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const worksheetId = Number(id);
  if (!Number.isInteger(worksheetId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.trnWorksheetHeader.findUnique({ where: { WorksheetID: worksheetId } });
  if (!header) return apiError(404, "WORKSHEET_NOT_FOUND");

  const denied = !(await hasPermission(user, "WORKSHEET", "approve", header.SiteCode));
  if (denied) return apiError(403, "FORBIDDEN", "Missing 'approve' permission on 'WORKSHEET' for this site");

  if (header.Status !== "SUBMITTED") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a SUBMITTED worksheet can be approved", {
      currentStatus: header.Status,
    });
  }

  // approveWorksheet re-checks status inside its own transaction and leaves
  // the header at SUBMITTED (no partial write) if anything fails — e.g. an
  // employee whose EmployeeType has no matching sys_period for this month.
  const result = await approveWorksheet(worksheetId, user.userId);
  if (!result.ok) {
    return apiError(422, "AUTO_POST_FAILED", undefined, { ...result.error });
  }

  await logAction(user.userId, "APPROVE_WORKSHEET", { targetTable: "trn_worksheet_header", targetId: String(worksheetId) });

  return apiSuccess({ ok: true });
}
