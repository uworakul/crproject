import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { REQUEST_DOCUMENT_DOCTYPE, type RequestDocumentCode } from "@/lib/request";

// Approve = mark APPROVED + create one inv_employee_debt row per employee
// line, all in one DB transaction. Quota checking/mst_employee_quota update
// removed 2026-09-19 at the user's explicit request ("ไม่มีโควต้าเดิมแล้ว
// ออกแบบใหม่ ให้ดูตามรายการหัก") — tracking now flows through "รายการหัก"
// (ref_deduction_type) / "รายการหักต่องวด" (inv_employee_debt) instead, the
// same table the Employee Master page's installment-deduction tab already
// reads from, so an approved request shows up there automatically.
export async function POST(_req: Request, ctx: RouteContext<"/api/requests/[id]/approve">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.trnRequestHeader.findUnique({
    where: { RequestHeaderID: requestId },
    include: { Details: true },
  });
  if (!existing) return apiError(404, "REQUEST_NOT_FOUND");

  const documentCode = existing.DocumentCode as RequestDocumentCode;
  const denied = await requirePermission(user, REQUEST_DOCUMENT_DOCTYPE[documentCode], "approve");
  if (denied) return denied;

  if (existing.Status !== "SUBMITTED") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a SUBMITTED request can be approved", { currentStatus: existing.Status });
  }
  if (existing.Details.length === 0) {
    return apiError(422, "NO_DETAIL_ROWS", "This request has no employee lines to approve");
  }

  // Auto-provision the ref_deduction_type row this DocumentCode maps to, so
  // the debt rows below always have a valid DeductionCode FK — same
  // "create it the first time it's needed" convention as ref_document_number.
  const deductionType = await prisma.refDeductionType.upsert({
    where: { DeductionCode: existing.DocumentCode },
    update: {},
    create: { DeductionCode: existing.DocumentCode, DeductionName: existing.DocumentCode, IsInstallment: true, CreatedBy: user.userId },
  });

  const description = existing.Remark ?? `${existing.DocumentCode}${existing.DocumentNo ? ` ${existing.DocumentNo}` : ""}`;

  const [updated] = await prisma.$transaction([
    prisma.trnRequestHeader.update({
      where: { RequestHeaderID: requestId },
      data: { Status: "APPROVED", ApprovedBy: user.userId, ApprovedDate: new Date(), UpdatedBy: user.userId, UpdatedDate: new Date() },
    }),
    ...existing.Details.map((d) =>
      prisma.invEmployeeDebt.create({
        data: {
          EmpCode: d.EmpCode,
          DeductionCode: deductionType.DeductionCode,
          Description: description,
          TotalAmount: d.Amount,
          RemainingAmount: d.Amount,
          DeductPerPeriod: d.DeductPerPeriod,
          Status: "OPEN",
          CreatedBy: user.userId,
        },
      }),
    ),
  ]);

  await logAction(user.userId, "APPROVE_REQUEST", { targetTable: "trn_request_header", targetId: id });
  return apiSuccess(updated);
}
