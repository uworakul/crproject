import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { isValidEmployeeType, isValidEmployeeStatus } from "@/lib/validation";

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

// null clears the field, a non-empty string sets it (trimmed), "" also
// clears it (empty text input), undefined/absent leaves it untouched.
function optStr(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v === "string") return v.trim() || null;
  return undefined;
}

// Same idea for nullable numeric fields — "" and null both clear it.
function optNum(v: unknown): number | null | undefined {
  if (v === null || v === "") return null;
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
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
    title?: unknown;
    firstName?: unknown;
    lastName?: unknown;
    address?: unknown;
    deptCode?: unknown;
    positionCode?: unknown;
    defaultSiteCode?: unknown;
    companyCode?: unknown;
    employeeType?: unknown;
    employeeStatus?: unknown;
    startDate?: unknown;
    resignDate?: unknown;
    bankCode?: unknown;
    bankAccountNo?: unknown;
    dailyRate?: unknown;
    isActive?: unknown;
    birthDate?: unknown;
    probationPassDate?: unknown;
    certificateNo?: unknown;
    idCardIssuedBy?: unknown;
    idCardIssueDate?: unknown;
    idCardExpiryDate?: unknown;
    idCardAddress?: unknown;
    phoneNo?: unknown;
    emergencyContactName?: unknown;
    emergencyContactPhone?: unknown;
    guarantorName?: unknown;
    maritalStatus?: unknown;
    childrenCount?: unknown;
    parentSupportAmount?: unknown;
    lifeInsurancePremium?: unknown;
    healthInsurancePremium?: unknown;
    parentHealthInsurancePremium?: unknown;
    rmfPurchaseAmount?: unknown;
    homeLoanInterestAmount?: unknown;
    donationAmount?: unknown;
    referrerEmpCode?: unknown;
    blacklistCode?: unknown;
    bloodType?: unknown;
    height?: unknown;
    weight?: unknown;
    bodyType?: unknown;
    distinguishingMarks?: unknown;
    otRatePerDay?: unknown;
    monthlySalary?: unknown;
    employeePositionAllowance?: unknown;
    gender?: unknown;
    religion?: unknown;
    ethnicity?: unknown;
    nationality?: unknown;
    education?: unknown;
    licenseNo6?: unknown;
    licenseDate6?: unknown;
    licenseNo7?: unknown;
    licenseDate7?: unknown;
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
  // "RESIGNED" is set only by POST /api/employees/[empCode]/resign, which
  // also stamps ResignDate consistently — blocked here to keep that the one
  // path that can retire an employee.
  if (body.employeeStatus !== undefined) {
    if (!isValidEmployeeStatus(body.employeeStatus)) {
      return apiError(400, "VALIDATION_FAILED", "employeeStatus must be one of the allowed values");
    }
    if (body.employeeStatus === "RESIGNED") {
      return apiError(400, "VALIDATION_FAILED", "Use POST /api/employees/[empCode]/resign to set RESIGNED");
    }
  }

  const dateFields: Record<string, unknown> = {
    birthDate: body.birthDate,
    probationPassDate: body.probationPassDate,
    idCardIssueDate: body.idCardIssueDate,
    idCardExpiryDate: body.idCardExpiryDate,
    licenseDate6: body.licenseDate6,
    licenseDate7: body.licenseDate7,
    resignDate: body.resignDate,
  };
  const parsedDates: Record<string, Date | null | undefined> = {};
  for (const [key, raw] of Object.entries(dateFields)) {
    if (raw === null || raw === "") {
      parsedDates[key] = null;
    } else if (typeof raw === "string") {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return apiError(400, "VALIDATION_FAILED", `${key} is invalid`);
      parsedDates[key] = d;
    } else {
      parsedDates[key] = undefined;
    }
  }

  // StartDate is NOT NULL in the DB — unlike the other date fields above,
  // "" can't mean "clear it" here, so it gets its own validation.
  let startDate: Date | undefined;
  if (body.startDate !== undefined) {
    if (typeof body.startDate !== "string" || !body.startDate) {
      return apiError(400, "VALIDATION_FAILED", "startDate is required");
    }
    const d = new Date(body.startDate);
    if (Number.isNaN(d.getTime())) return apiError(400, "VALIDATION_FAILED", "startDate is invalid");
    startDate = d;
  }

  if (body.childrenCount !== undefined && body.childrenCount !== null && body.childrenCount !== "") {
    const n = Number(body.childrenCount);
    if (!Number.isInteger(n) || n < 0) return apiError(400, "VALIDATION_FAILED", "childrenCount must be a non-negative integer");
  }

  const updated = await prisma.mstEmployee.update({
    where: { EmpCode: empCode },
    data: {
      FullName: typeof body.fullName === "string" ? body.fullName.trim() : undefined,
      Title: optStr(body.title),
      FirstName: optStr(body.firstName),
      LastName: optStr(body.lastName),
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
      CompanyCode: body.companyCode === null ? null : typeof body.companyCode === "string" && body.companyCode ? body.companyCode : undefined,
      EmployeeType: isValidEmployeeType(body.employeeType) ? body.employeeType : undefined,
      // The earlier check already rejects "RESIGNED" with a 400, so by this
      // point isValidEmployeeStatus narrows body.employeeStatus to exclude it.
      EmployeeStatus: isValidEmployeeStatus(body.employeeStatus) ? body.employeeStatus : undefined,
      BankCode: body.bankCode === null ? null : typeof body.bankCode === "string" && body.bankCode ? body.bankCode : undefined,
      BankAccountNo:
        body.bankAccountNo === null ? null : typeof body.bankAccountNo === "string" ? body.bankAccountNo.trim() || null : undefined,
      DailyRate: body.dailyRate === null ? null : body.dailyRate !== undefined && body.dailyRate !== "" ? Number(body.dailyRate) : undefined,
      IsActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      StartDate: startDate,
      ResignDate: parsedDates.resignDate,
      BirthDate: parsedDates.birthDate,
      ProbationPassDate: parsedDates.probationPassDate,
      IDCardIssueDate: parsedDates.idCardIssueDate,
      IDCardExpiryDate: parsedDates.idCardExpiryDate,
      CertificateNo: optStr(body.certificateNo),
      IDCardIssuedBy: optStr(body.idCardIssuedBy),
      IDCardAddress: optStr(body.idCardAddress),
      PhoneNo: optStr(body.phoneNo),
      EmergencyContactName: optStr(body.emergencyContactName),
      EmergencyContactPhone: optStr(body.emergencyContactPhone),
      GuarantorName: optStr(body.guarantorName),
      MaritalStatus: optStr(body.maritalStatus),
      ChildrenCount:
        body.childrenCount === null ? null : body.childrenCount !== undefined && body.childrenCount !== "" ? Number(body.childrenCount) : undefined,
      ParentSupportAmount: optNum(body.parentSupportAmount),
      LifeInsurancePremium: optNum(body.lifeInsurancePremium),
      HealthInsurancePremium: optNum(body.healthInsurancePremium),
      ParentHealthInsurancePremium: optNum(body.parentHealthInsurancePremium),
      RMFPurchaseAmount: optNum(body.rmfPurchaseAmount),
      HomeLoanInterestAmount: optNum(body.homeLoanInterestAmount),
      DonationAmount: optNum(body.donationAmount),
      ReferrerEmpCode: optStr(body.referrerEmpCode),
      BlacklistCode: optStr(body.blacklistCode),
      BloodType: optStr(body.bloodType),
      Height: optNum(body.height),
      Weight: optNum(body.weight),
      BodyType: optStr(body.bodyType),
      DistinguishingMarks: optStr(body.distinguishingMarks),
      OTRatePerDay: optNum(body.otRatePerDay),
      MonthlySalary: optNum(body.monthlySalary),
      EmployeePositionAllowance: optNum(body.employeePositionAllowance),
      Gender: optStr(body.gender),
      Religion: optStr(body.religion),
      Ethnicity: optStr(body.ethnicity),
      Nationality: optStr(body.nationality),
      Education: optStr(body.education),
      LicenseNo6: optStr(body.licenseNo6),
      LicenseDate6: parsedDates.licenseDate6,
      LicenseNo7: optStr(body.licenseNo7),
      LicenseDate7: parsedDates.licenseDate7,
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
