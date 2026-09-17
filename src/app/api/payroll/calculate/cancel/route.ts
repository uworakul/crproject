import { NextRequest } from "next/server";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { cancelPayrollCalculate } from "@/lib/payroll";

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_CANCEL_CALCULATE", "save");
  if (denied) return denied;

  let body: { periodId?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const periodId = Number(body.periodId);
  if (!Number.isInteger(periodId)) return apiError(400, "INVALID_PARAMS", "periodId is required and must be an integer");

  try {
    const result = await cancelPayrollCalculate(periodId, user.userId);
    await logAction(user.userId, "PAYROLL_CANCEL_CALCULATE", { targetTable: "trn_payroll_transaction", targetId: String(periodId) });
    return apiSuccess({ employeeCount: result.employeeCount, totalAmount: result.totalAmount.toString() });
  } catch (err) {
    if (err instanceof Error && err.message === "PERIOD_NOT_FOUND") return apiError(404, "PERIOD_NOT_FOUND");
    if (err instanceof Error && err.message === "PERIOD_LOCKED") return apiError(409, "PERIOD_LOCKED");
    throw err;
  }
}
