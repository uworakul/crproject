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

  const incomeTypes = await prisma.refIncomeType.findMany({ orderBy: { IncomeCode: "asc" } });
  return apiSuccess(incomeTypes);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "INCOME_DEDUCTION", "save");
  if (denied) return denied;

  let body: { incomeCode?: unknown; incomeName?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const incomeCode = typeof body.incomeCode === "string" ? body.incomeCode.trim() : "";
  const incomeName = typeof body.incomeName === "string" ? body.incomeName.trim() : "";
  if (!incomeCode || !incomeName) return apiError(400, "INVALID_PARAMS", "incomeCode and incomeName are required");

  const existing = await prisma.refIncomeType.findUnique({ where: { IncomeCode: incomeCode } });
  if (existing) return apiError(409, "INCOME_TYPE_ALREADY_EXISTS", undefined, { incomeCode });

  const created = await prisma.refIncomeType.create({ data: { IncomeCode: incomeCode, IncomeName: incomeName, CreatedBy: user.userId } });
  await logAction(user.userId, "CREATE_INCOME_TYPE", { targetTable: "ref_income_type", targetId: incomeCode });
  return apiSuccess(created, 201);
}
