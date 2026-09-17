import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/employees/[empCode]/resign">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "save");
  if (denied) return denied;

  const { empCode } = await ctx.params;
  const existing = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!existing) return apiError(404, "EMPLOYEE_NOT_FOUND");
  if (existing.EmployeeStatus === "RESIGNED") {
    return apiError(409, "ALREADY_RESIGNED");
  }

  let body: { resignDate?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const resignDate = typeof body.resignDate === "string" && body.resignDate ? new Date(body.resignDate) : new Date();

  const updated = await prisma.mstEmployee.update({
    where: { EmpCode: empCode },
    data: { EmployeeStatus: "RESIGNED", ResignDate: resignDate, UpdatedBy: user.userId, UpdatedDate: new Date() },
  });

  await logAction(user.userId, "RESIGN_EMPLOYEE", { targetTable: "mst_employee", targetId: empCode });
  return apiSuccess(updated);
}
