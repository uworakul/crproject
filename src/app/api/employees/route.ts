import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { isValidEmployeeType } from "@/lib/validation";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "read");
  if (denied) return denied;

  const employees = await prisma.mstEmployee.findMany({
    select: {
      EmpCode: true,
      FullName: true,
      EmployeeStatus: true,
      EmployeeType: true,
      DeptCode: true,
      PositionCode: true,
      DefaultSiteCode: true,
      IsActive: true,
    },
    orderBy: { EmpCode: "asc" },
  });
  return apiSuccess(employees);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "save");
  if (denied) return denied;

  let body: {
    empCode?: unknown;
    idCardNo?: unknown;
    fullName?: unknown;
    address?: unknown;
    startDate?: unknown;
    deptCode?: unknown;
    positionCode?: unknown;
    defaultSiteCode?: unknown;
    employeeType?: unknown;
    bankCode?: unknown;
    bankAccountNo?: unknown;
    dailyRate?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const empCode = typeof body.empCode === "string" ? body.empCode.trim() : "";
  const idCardNo = typeof body.idCardNo === "string" ? body.idCardNo.trim() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const startDate = typeof body.startDate === "string" ? body.startDate : "";

  if (!empCode || !idCardNo || !fullName || !startDate) {
    return apiError(400, "INVALID_PARAMS", "empCode, idCardNo, fullName, and startDate are required");
  }
  if (!isValidEmployeeType(body.employeeType)) {
    return apiError(400, "VALIDATION_FAILED", "employeeType must be one of the allowed values");
  }

  const existing = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (existing) return apiError(409, "EMPLOYEE_ALREADY_EXISTS", undefined, { empCode });

  const existingIdCard = await prisma.mstEmployee.findUnique({ where: { IDCardNo: idCardNo } });
  if (existingIdCard) return apiError(409, "ID_CARD_ALREADY_EXISTS", undefined, { idCardNo });

  const dailyRate = body.dailyRate !== undefined && body.dailyRate !== "" ? Number(body.dailyRate) : null;
  if (dailyRate !== null && (!Number.isFinite(dailyRate) || dailyRate < 0)) {
    return apiError(400, "VALIDATION_FAILED", "dailyRate must be a non-negative number");
  }

  const created = await prisma.mstEmployee.create({
    data: {
      EmpCode: empCode,
      IDCardNo: idCardNo,
      FullName: fullName,
      Address: typeof body.address === "string" && body.address.trim() ? body.address.trim() : null,
      StartDate: new Date(startDate),
      DeptCode: typeof body.deptCode === "string" && body.deptCode ? body.deptCode : null,
      PositionCode: typeof body.positionCode === "string" && body.positionCode ? body.positionCode : null,
      DefaultSiteCode: typeof body.defaultSiteCode === "string" && body.defaultSiteCode ? body.defaultSiteCode : null,
      EmployeeType: body.employeeType,
      BankCode: typeof body.bankCode === "string" && body.bankCode ? body.bankCode : null,
      BankAccountNo: typeof body.bankAccountNo === "string" && body.bankAccountNo.trim() ? body.bankAccountNo.trim() : null,
      DailyRate: dailyRate,
    },
  });

  // BR-011: 5 quota rows exist for every employee from day one (limit 0 until HR sets one).
  await prisma.mstEmployeeQuota.createMany({
    data: (["ADVANCE", "LOAN", "UNIFORM", "SERVICE", "INSURANCE"] as const).map((QuotaType) => ({
      EmpCode: empCode,
      QuotaType,
    })),
  });

  await logAction(user.userId, "CREATE_EMPLOYEE", { targetTable: "mst_employee", targetId: empCode });
  return apiSuccess(created, 201);
}
