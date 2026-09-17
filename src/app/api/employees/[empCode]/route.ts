import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { isValidEmployeeType } from "@/lib/validation";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/employees/[empCode]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "read");
  if (denied) return denied;

  const { empCode } = await ctx.params;
  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND");

  return apiSuccess(employee);
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/employees/[empCode]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "save");
  if (denied) return denied;

  const { empCode } = await ctx.params;
  const existing = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!existing) return apiError(404, "EMPLOYEE_NOT_FOUND");

  let body: {
    fullName?: unknown;
    address?: unknown;
    deptCode?: unknown;
    positionCode?: unknown;
    defaultSiteCode?: unknown;
    employeeType?: unknown;
    bankCode?: unknown;
    bankAccountNo?: unknown;
    dailyRate?: unknown;
    isActive?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  if (body.employeeType !== undefined && !isValidEmployeeType(body.employeeType)) {
    return apiError(400, "VALIDATION_FAILED", "employeeType must be one of the allowed values");
  }
  if (body.dailyRate !== undefined && body.dailyRate !== "" && body.dailyRate !== null) {
    const n = Number(body.dailyRate);
    if (!Number.isFinite(n) || n < 0) return apiError(400, "VALIDATION_FAILED", "dailyRate must be a non-negative number");
  }

  const updated = await prisma.mstEmployee.update({
    where: { EmpCode: empCode },
    data: {
      FullName: typeof body.fullName === "string" ? body.fullName.trim() : undefined,
      Address: body.address === null ? null : typeof body.address === "string" ? body.address.trim() || null : undefined,
      DeptCode: body.deptCode === null ? null : typeof body.deptCode === "string" && body.deptCode ? body.deptCode : undefined,
      PositionCode:
        body.positionCode === null ? null : typeof body.positionCode === "string" && body.positionCode ? body.positionCode : undefined,
      DefaultSiteCode:
        body.defaultSiteCode === null
          ? null
          : typeof body.defaultSiteCode === "string" && body.defaultSiteCode
            ? body.defaultSiteCode
            : undefined,
      EmployeeType: isValidEmployeeType(body.employeeType) ? body.employeeType : undefined,
      BankCode: body.bankCode === null ? null : typeof body.bankCode === "string" && body.bankCode ? body.bankCode : undefined,
      BankAccountNo:
        body.bankAccountNo === null ? null : typeof body.bankAccountNo === "string" ? body.bankAccountNo.trim() || null : undefined,
      DailyRate: body.dailyRate === null ? null : body.dailyRate !== undefined && body.dailyRate !== "" ? Number(body.dailyRate) : undefined,
      IsActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_EMPLOYEE", { targetTable: "mst_employee", targetId: empCode });
  return apiSuccess(updated);
}

// Soft delete — administrative correction only. Normal offboarding is the
// "resign" action (separate endpoint), which keeps EmployeeStatus/ResignDate
// as the real record and leaves IsActive untouched.
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/employees/[empCode]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "delete");
  if (denied) return denied;

  const { empCode } = await ctx.params;
  const existing = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!existing) return apiError(404, "EMPLOYEE_NOT_FOUND");

  await prisma.mstEmployee.update({
    where: { EmpCode: empCode },
    data: { IsActive: false, UpdatedBy: user.userId, UpdatedDate: new Date() },
  });
  await logAction(user.userId, "DEACTIVATE_EMPLOYEE", { targetTable: "mst_employee", targetId: empCode });
  return apiSuccess({ ok: true });
}
