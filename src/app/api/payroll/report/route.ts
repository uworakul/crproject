import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";

// One consolidated summary report (by site + grand total) for a period —
// not the "30+ รายงาน" the FSD's legacy-reference Site Map mentions without
// naming any of them (confirmed out of scope for this pass with the user;
// see CLAUDE.md "Payroll module").
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_REPORT", "read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const periodId = Number(searchParams.get("periodId"));
  if (!Number.isInteger(periodId)) return apiError(400, "INVALID_PARAMS", "periodId is required and must be an integer");

  const period = await prisma.sysPeriod.findUnique({ where: { PeriodID: periodId } });
  if (!period) return apiError(404, "PERIOD_NOT_FOUND");

  const transactions = await prisma.trnPayrollTransaction.findMany({
    where: { PeriodID: periodId },
    include: { Site: { select: { SiteName: true } } },
    orderBy: [{ SiteCode: "asc" }, { EmpCode: "asc" }],
  });

  const bySite = new Map<string, { siteCode: string; siteName: string; employeeCount: number; grossWage: number; taxWithheld: number; ssoAmount: number; netPay: number }>();
  for (const t of transactions) {
    const row = bySite.get(t.SiteCode) ?? { siteCode: t.SiteCode, siteName: t.Site.SiteName, employeeCount: 0, grossWage: 0, taxWithheld: 0, ssoAmount: 0, netPay: 0 };
    row.employeeCount += 1;
    row.grossWage += Number(t.GrossWage);
    row.taxWithheld += Number(t.TaxWithheld);
    row.ssoAmount += Number(t.SSOAmount);
    row.netPay += Number(t.NetPay);
    bySite.set(t.SiteCode, row);
  }

  const bySiteRows = [...bySite.values()];
  const grandTotal = bySiteRows.reduce(
    (acc, r) => ({
      employeeCount: acc.employeeCount + r.employeeCount,
      grossWage: acc.grossWage + r.grossWage,
      taxWithheld: acc.taxWithheld + r.taxWithheld,
      ssoAmount: acc.ssoAmount + r.ssoAmount,
      netPay: acc.netPay + r.netPay,
    }),
    { employeeCount: 0, grossWage: 0, taxWithheld: 0, ssoAmount: 0, netPay: 0 },
  );

  return apiSuccess({ period, bySite: bySiteRows, grandTotal });
}
