import { NextRequest } from "next/server";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";
import type { ReportFilters } from "@/lib/reports/types";
import { getAgeDistribution, getHeadcountBySite, getCostBySite } from "@/lib/reports/dashboard-data";

// GET /api/employee-dashboard?metric=age|headcount-by-site|cost-by-site&...filters
// Interactive JSON endpoint for the Dashboard screen (not a PDF/Excel export
// like the rest of /payroll/reports — this data is rendered client-side as
// a chart or on-screen table). Same PAYROLL_REPORT read permission as the
// other reports, since it draws on the same underlying data.
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_REPORT", "read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const metric = searchParams.get("metric");
  const filters: ReportFilters = {
    companyCode: searchParams.get("companyCode") || undefined,
    deptCode: searchParams.get("deptCode") || undefined,
    siteCode: searchParams.get("siteCode") || undefined,
    bankCode: searchParams.get("bankCode") || undefined,
    employeeType: searchParams.get("employeeType") || undefined,
    empCode: searchParams.get("empCode") || undefined,
  };

  if (metric === "age") return apiSuccess(await getAgeDistribution(filters));
  if (metric === "headcount-by-site") return apiSuccess(await getHeadcountBySite(filters));
  if (metric === "cost-by-site") {
    const periodId = searchParams.get("periodId");
    if (!periodId) return apiError(400, "INVALID_PARAMS", "periodId is required for this metric");
    return apiSuccess(await getCostBySite(Number(periodId), filters));
  }
  return apiError(404, "METRIC_NOT_FOUND", "Unknown metric", { metric });
}
