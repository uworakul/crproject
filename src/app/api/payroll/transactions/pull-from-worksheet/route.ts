import { NextRequest } from "next/server";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";
import { logAction } from "@/lib/audit-log";
import { pullPayrollFromWorksheet } from "@/lib/payroll";

// "ดึงข้อมูลจาก Worksheet" (2026-09-21, รายการประจำงวด) — confirmed with the
// user this does both at once: adds detail lines for employees whose
// Worksheet-derived attendance is on trn_payroll_transaction but never got
// itemized (WorkDays/DoubleShiftDays only get set by approveWorksheet()'s
// own upsert, which doesn't seed trn_payroll_transaction_detail the way
// GET .../by-employee does), and refreshes already-itemized employees' Days/
// Amount to match the current WorkDays/DoubleShiftDays. See
// pullPayrollFromWorksheet() in src/lib/payroll.ts for the exact formula and
// the APPROVED-only guard.
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

  const result = await pullPayrollFromWorksheet(periodId, employeeType, companyCode, user.userId);

  await logAction(user.userId, "PULL_PAYROLL_FROM_WORKSHEET", {
    targetTable: "trn_payroll_transaction",
    targetId: String(periodId),
    detail: `employeeType=${employeeType} companyCode=${companyCode ?? "-"} employeeCount=${result.employeeCount} linesCreated=${result.linesCreated} linesUpdated=${result.linesUpdated}`,
  });

  return apiSuccess(result);
}
