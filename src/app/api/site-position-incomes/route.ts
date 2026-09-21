import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { isValidRateBasis } from "@/lib/site";

export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SITE", "read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const sitePositionId = Number(searchParams.get("sitePositionId"));
  if (!Number.isInteger(sitePositionId)) return apiError(400, "INVALID_PARAMS", "sitePositionId is required");

  const rows = await prisma.mstSitePositionIncome.findMany({
    where: { SitePositionID: sitePositionId },
    include: { IncomeType: { select: { IncomeName: true } } },
    orderBy: { IncomeCode: "asc" },
  });
  return apiSuccess(rows);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SITE", "save");
  if (denied) return denied;

  let body: { sitePositionId?: unknown; incomeCode?: unknown; amount?: unknown; rateBasis?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const sitePositionId = Number(body.sitePositionId);
  const incomeCode = typeof body.incomeCode === "string" ? body.incomeCode.trim() : "";
  const amount = Number(body.amount);
  const rateBasis = body.rateBasis ?? "DAILY";
  if (!Number.isInteger(sitePositionId) || !incomeCode) return apiError(400, "INVALID_PARAMS", "sitePositionId and incomeCode are required");
  if (!Number.isFinite(amount) || amount < 0) return apiError(400, "VALIDATION_FAILED", "amount must be a non-negative number");
  if (!isValidRateBasis(rateBasis)) return apiError(400, "VALIDATION_FAILED", "rateBasis must be DAILY or MONTHLY");

  const sitePosition = await prisma.mstSitePosition.findUnique({ where: { SitePositionID: sitePositionId } });
  if (!sitePosition) return apiError(404, "SITE_POSITION_NOT_FOUND", undefined, { sitePositionId });
  const incomeType = await prisma.refIncomeType.findUnique({ where: { IncomeCode: incomeCode } });
  if (!incomeType) return apiError(404, "INCOME_TYPE_NOT_FOUND", undefined, { incomeCode });

  const existing = await prisma.mstSitePositionIncome.findUnique({
    where: { SitePositionID_IncomeCode: { SitePositionID: sitePositionId, IncomeCode: incomeCode } },
  });
  if (existing) return apiError(409, "SITE_POSITION_INCOME_ALREADY_EXISTS", undefined, { sitePositionId, incomeCode });

  const created = await prisma.mstSitePositionIncome.create({
    data: { SitePositionID: sitePositionId, IncomeCode: incomeCode, Amount: amount, RateBasis: rateBasis, CreatedBy: user.userId },
  });

  await logAction(user.userId, "CREATE_SITE_POSITION_INCOME", { targetTable: "mst_site_position_income", targetId: String(created.SitePositionIncomeID) });
  return apiSuccess(created, 201);
}
