import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";

// Used by the Return screen to let the user pick which OPEN debt a return
// should settle, and generally to see an employee's outstanding balances.
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_ISSUE", "read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const empCode = searchParams.get("empCode");
  const status = searchParams.get("status");

  const debts = await prisma.invEmployeeDebt.findMany({
    where: { ...(empCode ? { EmpCode: empCode } : {}), ...(status ? { Status: status } : {}) },
    include: { Employee: { select: { EmpCode: true, FullName: true } }, Movement: { select: { MovementID: true, MovementDate: true } } },
    orderBy: { DebtID: "desc" },
  });
  return apiSuccess(debts);
}
