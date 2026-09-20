import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/inventory/stock-issues/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_ISSUE", "read");
  if (denied) return denied;

  const { id } = await ctx.params;
  const issueId = Number(id);
  if (!Number.isInteger(issueId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.invIssueHeader.findUnique({
    where: { IssueHeaderID: issueId },
    include: {
      Warehouse: { select: { WarehouseName: true } },
      Employee: { select: { FullName: true, Site: { select: { SiteName: true } } } },
      Details: { orderBy: { IssueDetailID: "asc" }, include: { Product: { select: { ProductName: true, UnitOfMeasure: true, UnitPrice: true } } } },
    },
  });
  if (!header) return apiError(404, "STOCK_ISSUE_NOT_FOUND");
  return apiSuccess(header);
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/inventory/stock-issues/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_ISSUE", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const issueId = Number(id);
  if (!Number.isInteger(issueId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invIssueHeader.findUnique({ where: { IssueHeaderID: issueId } });
  if (!existing) return apiError(404, "STOCK_ISSUE_NOT_FOUND");
  if (existing.Status === "APPROVED") {
    return apiError(409, "STOCK_ISSUE_LOCKED", "An APPROVED issue can no longer be edited", { status: existing.Status });
  }

  let body: { deliveryNo?: unknown; deliveryDate?: unknown; cashReceived?: unknown; deductPerPeriod?: unknown; remark?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  let deliveryDate: Date | undefined;
  if (typeof body.deliveryDate === "string" && body.deliveryDate) {
    deliveryDate = new Date(body.deliveryDate);
    if (Number.isNaN(deliveryDate.getTime())) return apiError(400, "VALIDATION_FAILED", "deliveryDate is invalid");
  }

  let cashReceived: number | undefined;
  if (body.cashReceived !== undefined) {
    cashReceived = Number(body.cashReceived);
    if (!Number.isFinite(cashReceived) || cashReceived < 0) return apiError(400, "VALIDATION_FAILED", "cashReceived must be a non-negative number");
  }

  let deductPerPeriod: number | null | undefined;
  if (body.deductPerPeriod !== undefined) {
    deductPerPeriod = body.deductPerPeriod === null || body.deductPerPeriod === "" ? null : Number(body.deductPerPeriod);
    if (deductPerPeriod !== null && (!Number.isFinite(deductPerPeriod) || deductPerPeriod < 0)) {
      return apiError(400, "VALIDATION_FAILED", "deductPerPeriod must be a non-negative number");
    }
  }

  const updated = await prisma.invIssueHeader.update({
    where: { IssueHeaderID: issueId },
    data: {
      DeliveryNo: body.deliveryNo === null ? null : typeof body.deliveryNo === "string" ? body.deliveryNo.trim() || null : undefined,
      DeliveryDate: deliveryDate,
      CashReceived: cashReceived,
      DeductPerPeriod: deductPerPeriod,
      Remark: body.remark === null ? null : typeof body.remark === "string" ? body.remark.trim() || null : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_STOCK_ISSUE", { targetTable: "inv_issue_header", targetId: id });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/inventory/stock-issues/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_ISSUE", "delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  const issueId = Number(id);
  if (!Number.isInteger(issueId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invIssueHeader.findUnique({ where: { IssueHeaderID: issueId } });
  if (!existing) return apiError(404, "STOCK_ISSUE_NOT_FOUND");
  if (existing.Status !== "DRAFT") {
    return apiError(409, "STOCK_ISSUE_LOCKED", "Only a DRAFT issue can be deleted", { status: existing.Status });
  }

  await prisma.$transaction([
    prisma.invIssueDetail.deleteMany({ where: { IssueHeaderID: issueId } }),
    prisma.invIssueHeader.delete({ where: { IssueHeaderID: issueId } }),
  ]);
  await logAction(user.userId, "DELETE_STOCK_ISSUE", { targetTable: "inv_issue_header", targetId: id });
  return apiSuccess({ ok: true });
}
