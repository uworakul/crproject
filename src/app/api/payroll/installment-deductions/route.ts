import { NextRequest } from "next/server";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getOpenInstallmentDeductions } from "@/lib/payroll";

// 2026-09-21, "คำนวณเงินได้ประจำงวด" — the "รายการหักเป็นงวดที่มียอดคงค้าง"
// lines shown in the detail breakdown. Same live-preview data Calculate
// itself reads (getOpenInstallmentDeductions) — read-only here, this
// endpoint never touches inv_employee_debt.
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_CALCULATE", "read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const empCode = searchParams.get("empCode");
  if (!empCode) return apiError(400, "INVALID_PARAMS", "empCode is required");

  const lines = await getOpenInstallmentDeductions(empCode);
  return apiSuccess(lines);
}
