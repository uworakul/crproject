import { NextRequest } from "next/server";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";
import type { ReportFilters } from "@/lib/reports/types";
import {
  getAgeDrilldown,
  getHeadcountBySiteDrilldown,
  getCostBySiteDrilldown,
  getGenderBySiteDrilldown,
  getAgeBySiteDrilldown,
  getLeaveStatsDrilldown,
  getDamageCategoryDrilldown,
  getDamageDetailDrilldown,
} from "@/lib/reports/dashboard-drilldown";

// GET /api/employee-dashboard/drilldown?metric=...&bucket=...&group=...&series=...&...filters
// Backs the "click a bar/slice/row to see which employees" feature on the
// Dashboard (2026-09-28). Single-series metrics (age, headcount-by-site,
// cost-by-site, leave-stats-by-type) identify the clicked slice with
// `bucket` (the ChartDatum.label); grouped metrics (gender-by-site,
// age-by-site) need both `group` (the site cluster) and `series` (which
// bar within it). stock-value-monthly/welfare-value-monthly have no
// employee dimension at all and are intentionally absent here — the
// Dashboard UI never offers a drilldown click for those two.
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "DASHBOARD", "read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const metric = searchParams.get("metric");
  const bucket = searchParams.get("bucket");
  const group = searchParams.get("group");
  const series = searchParams.get("series");
  const filters: ReportFilters = {
    companyCode: searchParams.get("companyCode") || undefined,
    deptCode: searchParams.get("deptCode") || undefined,
    siteCode: searchParams.get("siteCode") || undefined,
    bankCode: searchParams.get("bankCode") || undefined,
    employeeType: searchParams.get("employeeType") || undefined,
    empCode: searchParams.get("empCode") || undefined,
    allowedCompanyCodes: user.allowedCompanyCodes,
    allowedEmployeeTypes: user.allowedEmployeeTypes,
  };

  if (metric === "age") {
    if (!bucket) return apiError(400, "INVALID_PARAMS", "bucket is required");
    return apiSuccess(await getAgeDrilldown(bucket, filters));
  }
  if (metric === "headcount-by-site") {
    if (!bucket) return apiError(400, "INVALID_PARAMS", "bucket is required");
    return apiSuccess(await getHeadcountBySiteDrilldown(bucket, filters));
  }
  if (metric === "cost-by-site") {
    const periodId = searchParams.get("periodId");
    if (!bucket || !periodId) return apiError(400, "INVALID_PARAMS", "bucket and periodId are required");
    return apiSuccess(await getCostBySiteDrilldown(bucket, Number(periodId), filters));
  }
  if (metric === "gender-by-site") {
    if (!group || !series) return apiError(400, "INVALID_PARAMS", "group and series are required");
    return apiSuccess(await getGenderBySiteDrilldown(group, series, filters));
  }
  if (metric === "age-by-site") {
    if (!group || !series) return apiError(400, "INVALID_PARAMS", "group and series are required");
    return apiSuccess(await getAgeBySiteDrilldown(group, series, filters));
  }
  if (metric === "leave-stats-by-type") {
    const year = searchParams.get("year");
    if (!bucket || !year) return apiError(400, "INVALID_PARAMS", "bucket and year are required");
    return apiSuccess(await getLeaveStatsDrilldown(bucket, Number(year), filters));
  }
  if (metric === "damage-analysis") {
    const year = searchParams.get("year");
    if (!year) return apiError(400, "INVALID_PARAMS", "year is required");
    const monthParam = searchParams.get("month");
    const month = monthParam ? Number(monthParam) : undefined;
    // Level 2 (a table row's "ดูรายละเอียด"): category code + row key.
    const category = searchParams.get("category");
    const key = searchParams.get("key");
    if (category && key) {
      if (category !== "STOCK_LOSS" && category !== "BAD_DEBT" && category !== "WELFARE") return apiError(400, "INVALID_PARAMS", "unknown category");
      return apiSuccess(await getDamageDetailDrilldown(category, key, Number(year), month, filters));
    }
    // Level 1 (chart slice/bar click): category label.
    if (!bucket) return apiError(400, "INVALID_PARAMS", "bucket or category+key is required");
    return apiSuccess(await getDamageCategoryDrilldown(bucket, Number(year), month, filters));
  }
  return apiError(404, "METRIC_NOT_FOUND", "Drilldown not supported for this metric", { metric });
}
