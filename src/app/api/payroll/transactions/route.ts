import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_TRANSACTION", "read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const periodId = Number(searchParams.get("periodId"));
  if (!Number.isInteger(periodId)) return apiError(400, "INVALID_PARAMS", "periodId is required and must be an integer");

  const transactions = await prisma.trnPayrollTransaction.findMany({
    where: { PeriodID: periodId },
    include: { Employee: { select: { EmpCode: true, FullName: true } }, Site: { select: { SiteCode: true, SiteName: true } } },
    orderBy: { EmpCode: "asc" },
  });
  return apiSuccess(transactions);
}
