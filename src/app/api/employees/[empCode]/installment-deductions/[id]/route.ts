import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Edit description/deductPerPeriod, or manually toggle Status OPEN/CLOSED.
// TotalAmount/PaidAmount/RemainingAmount are not editable here — those stay
// driven by the Inventory Return-confirm flow for movement-origin debts;
// manually-created ones have no automatic paydown yet (tracked, not applied
// to Payroll Calculate — see CLAUDE.md).
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/employees/[empCode]/installment-deductions/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "save");
  if (denied) return denied;

  const { empCode, id } = await ctx.params;
  const debtId = Number(id);
  if (!Number.isInteger(debtId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invEmployeeDebt.findUnique({ where: { DebtID: debtId } });
  if (!existing || existing.EmpCode !== empCode) return apiError(404, "DEBT_NOT_FOUND");

  let body: { description?: unknown; deductPerPeriod?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  if (body.status !== undefined && body.status !== "OPEN" && body.status !== "CLOSED") {
    return apiError(400, "VALIDATION_FAILED", "status must be OPEN or CLOSED");
  }
  let deductPerPeriod: number | null | undefined;
  if (body.deductPerPeriod === null || body.deductPerPeriod === "") {
    deductPerPeriod = null;
  } else if (body.deductPerPeriod !== undefined) {
    deductPerPeriod = Number(body.deductPerPeriod);
    if (!Number.isFinite(deductPerPeriod) || deductPerPeriod <= 0) {
      return apiError(400, "VALIDATION_FAILED", "deductPerPeriod must be a positive number");
    }
  }

  const updated = await prisma.invEmployeeDebt.update({
    where: { DebtID: debtId },
    data: {
      Description: body.description === null ? null : typeof body.description === "string" ? body.description.trim() || null : undefined,
      DeductPerPeriod: deductPerPeriod,
      Status: body.status === "OPEN" || body.status === "CLOSED" ? body.status : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_INSTALLMENT_DEDUCTION", { targetTable: "inv_employee_debt", targetId: id });
  return apiSuccess(updated);
}
