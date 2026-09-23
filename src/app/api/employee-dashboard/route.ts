import { NextRequest } from "next/server";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";
import type { ReportFilters } from "@/lib/reports/types";
import {
  getAgeDistribution,
  getHeadcountBySite,
  getCostBySite,
  getStockValueByMonth,
  getWelfareValueByMonth,
  getGenderBySite,
  getAgeBySite,
  getLeaveStatsByType,
} from "@/lib/reports/dashboard-data";

// GET /api/employee-dashboard?metric=...&...filters
// Interactive JSON endpoint for the Dashboard screen (not a PDF/Excel export
// like the rest of /payroll/reports — this data is rendered client-side as
// a chart or on-screen table). Same PAYROLL_REPORT read permission as the
// other reports for every metric, including the two stock/welfare ones
// added 2026-09-24 (not strictly employee data, but the page itself is
// already gated on this permission — no separate inventory-permission
// check is worth adding just for those two).
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
  if (metric === "stock-value-monthly") return apiSuccess(await getStockValueByMonth());
  if (metric === "welfare-value-monthly") return apiSuccess(await getWelfareValueByMonth());
  if (metric === "gender-by-site") return apiSuccess(await getGenderBySite(filters));
  if (metric === "age-by-site") return apiSuccess(await getAgeBySite(filters));
  if (metric === "leave-stats-by-type") {
    const year = searchParams.get("year");
    if (!year) return apiError(400, "INVALID_PARAMS", "year is required for this metric");
    return apiSuccess(await getLeaveStatsByType(Number(year), filters));
  }
  return apiError(404, "METRIC_NOT_FOUND", "Unknown metric", { metric });
}
