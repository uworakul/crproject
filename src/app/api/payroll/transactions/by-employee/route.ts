import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";

// Find-or-create the trn_payroll_transaction row for an employee's current
// period (2026-09-21, "รายการประจำงวด") — same idempotent-GET convention as
// Worksheet's getOrCreateDraftWorksheet(). "Current period" = sys_period
// where EmployeeType matches and IsCurrent=true (the existing toggle on
// /periods, not a new concept). A freshly-created row needs a SiteCode
// (NOT NULL) — uses the employee's DefaultSiteCode; if that's unset, the
// employee must be assigned a site first (422, not guessed).
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_TRANSACTION", "read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const empCode = searchParams.get("empCode");
  if (!empCode) return apiError(400, "INVALID_PARAMS", "empCode is required");

  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND", undefined, { empCode });

  const period = await prisma.sysPeriod.findFirst({ where: { EmployeeType: employee.EmployeeType, IsCurrent: true } });
  if (!period) return apiError(404, "NO_CURRENT_PERIOD", `No period is marked as current for EmployeeType ${employee.EmployeeType}`, { employeeType: employee.EmployeeType });

  let transaction = await prisma.trnPayrollTransaction.findUnique({
    where: { EmpCode_PeriodID: { EmpCode: empCode, PeriodID: period.PeriodID } },
    include: { Details: { orderBy: [{ LineType: "asc" }, { Code: "asc" }] } },
  });

  if (!transaction) {
    if (!employee.DefaultSiteCode) {
      return apiError(422, "EMPLOYEE_HAS_NO_SITE", "This employee has no DefaultSiteCode set — assign a site before creating a payroll transaction for them", { empCode });
    }
    const created = await prisma.trnPayrollTransaction.create({
      data: { EmpCode: empCode, PeriodID: period.PeriodID, SiteCode: employee.DefaultSiteCode, CreatedBy: user.userId },
    });
    transaction = { ...created, Details: [] };
  }

  return apiSuccess({ period, transaction });
}
