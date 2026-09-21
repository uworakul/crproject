import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { isValidRateBasis } from "@/lib/site";

// "รายได้พื้นฐาน" ต่อตำแหน่ง (2026-09-21) — mirrors site-position-incomes
// exactly, one level up (no Site dimension). Gated on REFERENCE permission
// since it lives under "รหัสอ้างอิงหลัก" → ตำแหน่ง, not SITE.
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const positionCode = searchParams.get("positionCode");
  if (!positionCode) return apiError(400, "INVALID_PARAMS", "positionCode is required");

  const rows = await prisma.mstPositionIncome.findMany({
    where: { PositionCode: positionCode },
    include: { IncomeType: { select: { IncomeName: true } } },
    orderBy: { IncomeCode: "asc" },
  });
  return apiSuccess(rows);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "save");
  if (denied) return denied;

  let body: { positionCode?: unknown; incomeCode?: unknown; amount?: unknown; rateBasis?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const positionCode = typeof body.positionCode === "string" ? body.positionCode.trim() : "";
  const incomeCode = typeof body.incomeCode === "string" ? body.incomeCode.trim() : "";
  const amount = Number(body.amount);
  const rateBasis = body.rateBasis ?? "DAILY";
  if (!positionCode || !incomeCode) return apiError(400, "INVALID_PARAMS", "positionCode and incomeCode are required");
  if (!Number.isFinite(amount) || amount < 0) return apiError(400, "VALIDATION_FAILED", "amount must be a non-negative number");
  if (!isValidRateBasis(rateBasis)) return apiError(400, "VALIDATION_FAILED", "rateBasis must be DAILY or MONTHLY");

  const position = await prisma.refPosition.findUnique({ where: { PositionCode: positionCode } });
  if (!position) return apiError(404, "POSITION_NOT_FOUND", undefined, { positionCode });
  const incomeType = await prisma.refIncomeType.findUnique({ where: { IncomeCode: incomeCode } });
  if (!incomeType) return apiError(404, "INCOME_TYPE_NOT_FOUND", undefined, { incomeCode });

  const existing = await prisma.mstPositionIncome.findUnique({
    where: { PositionCode_IncomeCode: { PositionCode: positionCode, IncomeCode: incomeCode } },
  });
  if (existing) return apiError(409, "POSITION_INCOME_ALREADY_EXISTS", undefined, { positionCode, incomeCode });

  const created = await prisma.mstPositionIncome.create({
    data: { PositionCode: positionCode, IncomeCode: incomeCode, Amount: amount, RateBasis: rateBasis, CreatedBy: user.userId },
  });

  await logAction(user.userId, "CREATE_POSITION_INCOME", { targetTable: "mst_position_income", targetId: String(created.PositionIncomeID) });
  return apiSuccess(created, 201);
}
