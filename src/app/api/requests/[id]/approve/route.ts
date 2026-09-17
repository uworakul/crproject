import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { REQUEST_TYPE_DOCTYPE, quotaTypeForRequest, type RequestType } from "@/lib/request";

// Approve = mark APPROVED + (for ADVANCE/LOAN only — TRAINING has no
// matching mst_employee_quota row, see src/lib/request.ts) bump QuotaUsed
// and recompute QuotaRemaining, all in one DB transaction so a request is
// never left approved without its quota being reflected.
export async function POST(_req: Request, ctx: RouteContext<"/api/requests/[id]/approve">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.trnRequest.findUnique({ where: { RequestID: requestId } });
  if (!existing) return apiError(404, "REQUEST_NOT_FOUND");

  const requestType = existing.RequestType as RequestType;
  const denied = await requirePermission(user, REQUEST_TYPE_DOCTYPE[requestType], "approve");
  if (denied) return denied;

  if (existing.Status !== "SUBMITTED") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a SUBMITTED request can be approved", { currentStatus: existing.Status });
  }

  const quotaType = quotaTypeForRequest(requestType);
  let quota = null;
  if (quotaType) {
    quota = await prisma.mstEmployeeQuota.findUnique({
      where: { EmpCode_QuotaType: { EmpCode: existing.EmpCode, QuotaType: quotaType } },
    });
    if (!quota) return apiError(422, "QUOTA_NOT_FOUND", undefined, { empCode: existing.EmpCode, quotaType });
    if (existing.Amount.greaterThan(quota.QuotaRemaining)) {
      return apiError(422, "QUOTA_EXCEEDED", "Amount exceeds the employee's remaining quota", {
        quotaRemaining: quota.QuotaRemaining.toString(),
      });
    }
  }

  const [updated] = await prisma.$transaction([
    prisma.trnRequest.update({
      where: { RequestID: requestId },
      data: { Status: "APPROVED", ApprovedBy: user.userId, ApprovedDate: new Date(), UpdatedBy: user.userId, UpdatedDate: new Date() },
    }),
    ...(quotaType && quota
      ? [
          prisma.mstEmployeeQuota.update({
            where: { QuotaID: quota.QuotaID },
            data: {
              QuotaUsed: quota.QuotaUsed.add(existing.Amount),
              QuotaRemaining: quota.QuotaRemaining.sub(existing.Amount),
              UpdatedBy: user.userId,
              UpdatedDate: new Date(),
            },
          }),
        ]
      : []),
  ]);

  await logAction(user.userId, "APPROVE_REQUEST", { targetTable: "trn_request", targetId: id });
  return apiSuccess(updated);
}
