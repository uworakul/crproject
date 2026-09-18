import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "TAX_RATE", "read");
  if (denied) return denied;

  const rows = await prisma.refDeductionRate.findMany({ orderBy: [{ SortOrder: "asc" }, { DeductionCode: "asc" }] });
  return apiSuccess(rows);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "TAX_RATE", "save");
  if (denied) return denied;

  let body: { deductionCode?: unknown; deductionName?: unknown; rate?: unknown; maxAmount?: unknown; effectiveYear?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const deductionCode = typeof body.deductionCode === "string" ? body.deductionCode.trim() : "";
  const deductionName = typeof body.deductionName === "string" ? body.deductionName.trim() : "";
  const maxAmount = Number(body.maxAmount);
  const effectiveYear = Number(body.effectiveYear);

  if (!deductionCode || !deductionName || !Number.isFinite(maxAmount) || !Number.isFinite(effectiveYear)) {
    return apiError(400, "INVALID_PARAMS", "deductionCode, deductionName, maxAmount, and effectiveYear are required");
  }

  const existing = await prisma.refDeductionRate.findUnique({ where: { DeductionCode: deductionCode } });
  if (existing) return apiError(409, "DEDUCTION_RATE_ALREADY_EXISTS", undefined, { deductionCode });

  const rate = body.rate !== undefined && body.rate !== null && body.rate !== "" ? Number(body.rate) : null;
  if (rate !== null && !Number.isFinite(rate)) return apiError(400, "INVALID_PARAMS", "rate must be a number");

  const created = await prisma.refDeductionRate.create({
    data: {
      DeductionCode: deductionCode,
      DeductionName: deductionName,
      Rate: rate,
      MaxAmount: maxAmount,
      EffectiveYear: effectiveYear,
      CreatedBy: user.userId,
    },
  });
  await logAction(user.userId, "CREATE_DEDUCTION_RATE", { targetTable: "ref_deduction_rate", targetId: deductionCode });
  return apiSuccess(created, 201);
}
