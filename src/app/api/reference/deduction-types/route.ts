import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "INCOME_DEDUCTION", "read");
  if (denied) return denied;

  const deductionTypes = await prisma.refDeductionType.findMany({ orderBy: { DeductionCode: "asc" } });
  return apiSuccess(deductionTypes);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "INCOME_DEDUCTION", "save");
  if (denied) return denied;

  let body: { deductionCode?: unknown; deductionName?: unknown; isInstallment?: unknown; isAutoCalculated?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const deductionCode = typeof body.deductionCode === "string" ? body.deductionCode.trim() : "";
  const deductionName = typeof body.deductionName === "string" ? body.deductionName.trim() : "";
  if (!deductionCode || !deductionName) return apiError(400, "INVALID_PARAMS", "deductionCode and deductionName are required");

  const existing = await prisma.refDeductionType.findUnique({ where: { DeductionCode: deductionCode } });
  if (existing) return apiError(409, "DEDUCTION_TYPE_ALREADY_EXISTS", undefined, { deductionCode });

  const created = await prisma.refDeductionType.create({
    data: {
      DeductionCode: deductionCode,
      DeductionName: deductionName,
      IsInstallment: body.isInstallment === true,
      IsAutoCalculated: body.isAutoCalculated === true,
      CreatedBy: user.userId,
    },
  });
  await logAction(user.userId, "CREATE_DEDUCTION_TYPE", { targetTable: "ref_deduction_type", targetId: deductionCode });
  return apiSuccess(created, 201);
}
