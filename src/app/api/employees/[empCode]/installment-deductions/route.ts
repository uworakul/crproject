import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentPeriodInstallmentAllocations } from "@/lib/payroll";

// รายการหักต่องวด — every inv_employee_debt row for this employee, whichever
// origin (inventory ISSUE confirm via MovementID, or created directly here
// via DeductionCode). Kept as one list so HR sees the full picture of
// what's being deducted from this employee, not two separate views.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/employees/[empCode]/installment-deductions">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "read");
  if (denied) return denied;

  const { empCode } = await ctx.params;
  const [rows, allocations] = await Promise.all([
    prisma.invEmployeeDebt.findMany({
      where: { EmpCode: empCode },
      include: {
        DeductionType: { select: { DeductionCode: true, DeductionName: true } },
        RequestHeader: { select: { DocumentNo: true, ApprovedDate: true } },
      },
      orderBy: { DebtID: "desc" },
    }),
    getCurrentPeriodInstallmentAllocations(empCode),
  ]);
  const withCalculated = rows.map((r) => ({ ...r, CalculatedAmount: allocations.get(r.DebtID)?.toString() ?? "0" }));
  return apiSuccess(withCalculated);
}

// Manually create an installment deduction not tied to an inventory
// movement (e.g. เงินกู้/เบิกล่วงหน้า) — only for deduction types flagged
// ref_deduction_type.IsInstallment (checked server-side, not just filtered
// in the UI's dropdown, so this can't be bypassed).
export async function POST(request: NextRequest, ctx: RouteContext<"/api/employees/[empCode]/installment-deductions">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "save");
  if (denied) return denied;

  const { empCode } = await ctx.params;
  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND");

  let body: { deductionCode?: unknown; totalAmount?: unknown; deductPerPeriod?: unknown; description?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const deductionCode = typeof body.deductionCode === "string" ? body.deductionCode.trim() : "";
  if (!deductionCode) return apiError(400, "INVALID_PARAMS", "deductionCode is required");

  const deductionType = await prisma.refDeductionType.findUnique({ where: { DeductionCode: deductionCode } });
  if (!deductionType) return apiError(404, "DEDUCTION_TYPE_NOT_FOUND");
  if (!deductionType.IsInstallment) {
    return apiError(400, "VALIDATION_FAILED", "This deduction type is not marked as หักเป็นงวด (IsInstallment)");
  }

  const totalAmount = Number(body.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return apiError(400, "VALIDATION_FAILED", "totalAmount must be a positive number");

  let deductPerPeriod: number | null = null;
  if (body.deductPerPeriod !== undefined && body.deductPerPeriod !== null && body.deductPerPeriod !== "") {
    deductPerPeriod = Number(body.deductPerPeriod);
    if (!Number.isFinite(deductPerPeriod) || deductPerPeriod <= 0) {
      return apiError(400, "VALIDATION_FAILED", "deductPerPeriod must be a positive number");
    }
  }

  const created = await prisma.invEmployeeDebt.create({
    data: {
      EmpCode: empCode,
      DeductionCode: deductionCode,
      Description: typeof body.description === "string" ? body.description.trim() || null : null,
      TotalAmount: totalAmount,
      RemainingAmount: totalAmount,
      DeductPerPeriod: deductPerPeriod,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "CREATE_INSTALLMENT_DEDUCTION", { targetTable: "inv_employee_debt", targetId: String(created.DebtID) });
  return apiSuccess(created, 201);
}
