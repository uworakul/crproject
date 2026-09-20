import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function POST(_req: Request, ctx: RouteContext<"/api/inventory/stock-issues/[id]/submit">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_ISSUE", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const issueId = Number(id);
  if (!Number.isInteger(issueId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invIssueHeader.findUnique({ where: { IssueHeaderID: issueId }, include: { Details: true } });
  if (!existing) return apiError(404, "STOCK_ISSUE_NOT_FOUND");

  if (existing.Status !== "DRAFT") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a DRAFT issue can be submitted", { currentStatus: existing.Status });
  }
  if (existing.Details.length === 0) {
    return apiError(422, "NO_DETAIL_ROWS", "Add at least one product line before submitting");
  }

  const updated = await prisma.invIssueHeader.update({
    where: { IssueHeaderID: issueId },
    data: { Status: "SUBMITTED", SubmittedDate: new Date(), UpdatedBy: user.userId, UpdatedDate: new Date() },
  });

  await logAction(user.userId, "SUBMIT_STOCK_ISSUE", { targetTable: "inv_issue_header", targetId: id });
  return apiSuccess(updated);
}
