import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/inventory/stock-issues/[id]/reject">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_ISSUE", "approve");
  if (denied) return denied;

  const { id } = await ctx.params;
  const issueId = Number(id);
  if (!Number.isInteger(issueId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invIssueHeader.findUnique({ where: { IssueHeaderID: issueId } });
  if (!existing) return apiError(404, "STOCK_ISSUE_NOT_FOUND");

  if (existing.Status !== "SUBMITTED") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a SUBMITTED issue can be rejected", { currentStatus: existing.Status });
  }

  let body: { reason?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return apiError(400, "INVALID_PARAMS", "reason is required");

  const updated = await prisma.invIssueHeader.update({
    where: { IssueHeaderID: issueId },
    data: { Status: "DRAFT", RejectedBy: user.userId, RejectedDate: new Date(), RejectReason: reason, UpdatedBy: user.userId, UpdatedDate: new Date() },
  });

  await logAction(user.userId, "REJECT_STOCK_ISSUE", { targetTable: "inv_issue_header", targetId: id, detail: reason });
  return apiSuccess(updated);
}
