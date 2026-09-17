import { NextRequest } from "next/server";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { runPayrollCalculate, MissingRateDataError } from "@/lib/payroll";

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_CALCULATE", "save");
  if (denied) return denied;

  let body: { periodId?: unknown; empCodeFrom?: unknown; empCodeTo?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const periodId = Number(body.periodId);
  if (!Number.isInteger(periodId)) return apiError(400, "INVALID_PARAMS", "periodId is required and must be an integer");
  const empCodeFrom = typeof body.empCodeFrom === "string" && body.empCodeFrom.trim() ? body.empCodeFrom.trim() : undefined;
  const empCodeTo = typeof body.empCodeTo === "string" && body.empCodeTo.trim() ? body.empCodeTo.trim() : undefined;

  try {
    const result = await runPayrollCalculate(periodId, user.userId, empCodeFrom, empCodeTo);
    await logAction(user.userId, "PAYROLL_CALCULATE", { targetTable: "trn_payroll_transaction", targetId: String(periodId) });
    return apiSuccess({ employeeCount: result.employeeCount, totalAmount: result.totalAmount.toString() });
  } catch (err) {
    if (err instanceof MissingRateDataError) {
      return apiError(422, `MISSING_${err.kind}`, `No ${err.kind === "TAX_BRACKET" ? "ref_tax_bracket" : "ref_sso_base"} rows for year ${err.year}`, { year: err.year });
    }
    if (err instanceof Error && err.message === "PERIOD_NOT_FOUND") return apiError(404, "PERIOD_NOT_FOUND");
    if (err instanceof Error && err.message === "PERIOD_LOCKED") return apiError(409, "PERIOD_LOCKED");
    throw err;
  }
}
