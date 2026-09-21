import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { isValidRateBasis } from "@/lib/site";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/site-position-incomes/[incomeId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SITE", "save");
  if (denied) return denied;

  const { incomeId } = await ctx.params;
  const id = Number(incomeId);
  if (!Number.isInteger(id)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.mstSitePositionIncome.findUnique({ where: { SitePositionIncomeID: id } });
  if (!existing) return apiError(404, "SITE_POSITION_INCOME_NOT_FOUND");

  let body: { amount?: unknown; rateBasis?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const amount = body.amount !== undefined ? Number(body.amount) : Number(existing.Amount);
  const rateBasis = body.rateBasis !== undefined ? body.rateBasis : existing.RateBasis;
  if (!Number.isFinite(amount) || amount < 0) return apiError(400, "VALIDATION_FAILED", "amount must be a non-negative number");
  if (!isValidRateBasis(rateBasis)) return apiError(400, "VALIDATION_FAILED", "rateBasis must be DAILY or MONTHLY");

  const updated = await prisma.mstSitePositionIncome.update({
    where: { SitePositionIncomeID: id },
    data: { Amount: amount, RateBasis: rateBasis, UpdatedBy: user.userId, UpdatedDate: new Date() },
  });

  await logAction(user.userId, "UPDATE_SITE_POSITION_INCOME", { targetTable: "mst_site_position_income", targetId: incomeId });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/site-position-incomes/[incomeId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SITE", "delete");
  if (denied) return denied;

  const { incomeId } = await ctx.params;
  const id = Number(incomeId);
  if (!Number.isInteger(id)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.mstSitePositionIncome.findUnique({ where: { SitePositionIncomeID: id } });
  if (!existing) return apiError(404, "SITE_POSITION_INCOME_NOT_FOUND");

  await prisma.mstSitePositionIncome.delete({ where: { SitePositionIncomeID: id } });
  await logAction(user.userId, "DELETE_SITE_POSITION_INCOME", { targetTable: "mst_site_position_income", targetId: incomeId });
  return apiSuccess({ ok: true });
}
