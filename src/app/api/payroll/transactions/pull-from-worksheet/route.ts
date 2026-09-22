import { NextRequest } from "next/server";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";
import { logAction } from "@/lib/audit-log";
import { pullPayrollFromWorksheet } from "@/lib/payroll";

// "ดึงข้อมูลจาก Worksheet" (2026-09-21, รายการประจำงวด; rewritten 2026-09-22 —
// see pullPayrollFromWorksheet() in src/lib/payroll.ts) — re-derives
// attendance straight from Worksheet's own APPROVED daily records every time
// it's called, and find-or-creates the trn_payroll_transaction row itself —
// safe to click any number of times, in any order relative to
// delete/unapprove/re-approve on either side (the original version instead
// trusted an already-existing trn_payroll_transaction row's WorkDays/
// DoubleShiftDays, which silently broke once that row was deleted from
// "รายการประจำงวด").
export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_TRANSACTION", "save");
  if (denied) return denied;

  let body: { periodId?: unknown; employeeType?: unknown; companyCode?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const periodId = Number(body.periodId);
  if (!Number.isInteger(periodId)) return apiError(400, "INVALID_PARAMS", "periodId is required and must be an integer");
  const employeeType = typeof body.employeeType === "string" ? body.employeeType : "";
  if (!employeeType) return apiError(400, "INVALID_PARAMS", "employeeType is required");
  const companyCode = typeof body.companyCode === "string" && body.companyCode ? body.companyCode : null;

  let result;
  try {
    result = await pullPayrollFromWorksheet(periodId, employeeType, companyCode, user.userId);
  } catch (err) {
    if (err instanceof Error && err.message === "PERIOD_NOT_FOUND") return apiError(404, "PERIOD_NOT_FOUND");
    if (err instanceof Error && err.message === "PERIOD_LOCKED") return apiError(409, "PERIOD_LOCKED", "งวดนี้ถูกล็อกแล้ว ไม่สามารถดึงข้อมูลจาก Worksheet ได้");
    throw err;
  }

  await logAction(user.userId, "PULL_PAYROLL_FROM_WORKSHEET", {
    targetTable: "trn_payroll_transaction",
    targetId: String(periodId),
    detail: `employeeType=${employeeType} companyCode=${companyCode ?? "-"} employeeCount=${result.employeeCount} linesCreated=${result.linesCreated} linesUpdated=${result.linesUpdated}`,
  });

  return apiSuccess(result);
}
