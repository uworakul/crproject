import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireSelfEmployee } from "@/lib/mobile-auth";

// POST { action: "SUBMIT" | "CANCEL" } on the employee's OWN uniform request.
//   SUBMIT: DRAFT (rejected by the approver) -> SUBMITTED again.
//   CANCEL: DRAFT or SUBMITTED -> deleted. APPROVED can no longer be withdrawn
//           (stock and the employee's debt were already posted).
export async function POST(request: NextRequest, ctx: RouteContext<"/api/mobile/uniform/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const me = await requireSelfEmployee(user);
  if ("error" in me) return me.error;

  const { id } = await ctx.params;
  const headerId = Number(id);
  if (!Number.isInteger(headerId)) return apiError(400, "INVALID_PARAMS");

  let body: { action?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }
  if (body.action !== "SUBMIT" && body.action !== "CANCEL") return apiError(400, "INVALID_PARAMS", "action must be SUBMIT or CANCEL");

  const existing = await prisma.invIssueHeader.findUnique({ where: { IssueHeaderID: headerId } });
  if (!existing || existing.EmpCode !== me.employee.EmpCode) return apiError(404, "STOCK_ISSUE_NOT_FOUND");

  if (body.action === "SUBMIT") {
    if (existing.Status !== "DRAFT") return apiError(409, "INVALID_STATUS_TRANSITION", "Only a DRAFT request can be submitted", { currentStatus: existing.Status });
    await prisma.invIssueHeader.update({
      where: { IssueHeaderID: headerId },
      data: { Status: "SUBMITTED", SubmittedDate: new Date(), UpdatedBy: user.userId, UpdatedDate: new Date() },
    });
    await logAction(user.userId, "SUBMIT_STOCK_ISSUE", { targetTable: "inv_issue_header", targetId: id, detail: "MOBILE" });
    return apiSuccess({ issueHeaderId: headerId, status: "SUBMITTED" });
  }

  const result = await prisma.$transaction(async (tx) => {
    const still = await tx.invIssueHeader.findFirst({ where: { IssueHeaderID: headerId, Status: { in: ["DRAFT", "SUBMITTED"] } }, select: { IssueHeaderID: true } });
    if (!still) return false;
    await tx.invIssueDetail.deleteMany({ where: { IssueHeaderID: headerId } });
    await tx.invIssueHeader.delete({ where: { IssueHeaderID: headerId } });
    return true;
  });
  if (!result) return apiError(409, "INVALID_STATUS_TRANSITION", "This request can no longer be cancelled");
  await logAction(user.userId, "DELETE_STOCK_ISSUE", { targetTable: "inv_issue_header", targetId: id, detail: `MOBILE cancel ${existing.DocumentNo ?? ""} (was ${existing.Status})` });
  return apiSuccess({ issueHeaderId: headerId, cancelled: true });
}
