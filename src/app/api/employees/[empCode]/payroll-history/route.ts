import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";

// BR-014: read-only history of what's been posted to trn_payroll_transaction
// for this employee (currently only ever written by Worksheet's approve
// step — the Payroll Calculate module that would add tax/SSO/deductions on
// top isn't built yet).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/employees/[empCode]/payroll-history">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE_PAYROLL", "read");
  if (denied) return denied;

  const { empCode } = await ctx.params;
  const rows = await prisma.trnPayrollTransaction.findMany({
    where: { EmpCode: empCode },
    include: { Period: true, Site: { select: { SiteName: true } } },
    orderBy: { CreatedDate: "desc" },
  });
  return apiSuccess(rows);
}
