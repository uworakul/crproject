import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/worksheets/[id]/reject">) {
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
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a SUBMITTED worksheet can be rejected", {
      currentStatus: header.Status,
    });
  }

  let body: { reason?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return apiError(400, "INVALID_PARAMS", "reason is required");

  // Rejected worksheets go back to DRAFT so the site head can fix and resubmit.
  await prisma.trnWorksheetHeader.update({
    where: { WorksheetID: worksheetId },
    data: {
      Status: "DRAFT",
      RejectedBy: user.userId,
      RejectedDate: new Date(),
      RejectReason: reason,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "REJECT_WORKSHEET", {
    targetTable: "trn_worksheet_header",
    targetId: String(worksheetId),
    detail: reason,
  });

  return apiSuccess({ ok: true });
}
