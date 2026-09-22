import { NextRequest } from "next/server";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getRationedDeductionBreakdown } from "@/lib/payroll";

// 2026-09-21, "คำนวณเงินได้ประจำงวด" — the "รายการหักเป็นงวดที่มียอดคงค้าง"
// lines shown in the detail breakdown.
//
// 2026-09-22: switched from empCode+getOpenInstallmentDeductions() (naive
// min(DeductPerPeriod,Remaining) per debt, no priority awareness) to
// transactionId+getRationedDeductionBreakdown() — the same priority-rationing
// computation recomputeTransactionOtherTotals() uses to actually save
// InstallmentDeduct, so what's shown here always matches what's stored (the
// "ลำดับการหักเงิน"/"หักเท่าที่หักได้" rules mean a debt lower in priority may
// show LESS than its full DeductPerPeriod, or 0, if the pool ran out before
// its turn — needs transaction context, not just the employee, to know that).
// Read-only — never touches inv_employee_debt.
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_CALCULATE", "read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const transactionId = Number(searchParams.get("transactionId"));
  if (!Number.isInteger(transactionId)) return apiError(400, "INVALID_PARAMS", "transactionId is required");

  const { items } = await getRationedDeductionBreakdown(transactionId);
  const installmentLines = items
    .filter((i) => i.source === "install")
    .map((i) => ({ debtId: Number(i.key.split(":")[1]), code: i.code, label: i.label, amount: i.allocated, remainingAmount: i.remainingAmount }));
  return apiSuccess(installmentLines);
}
