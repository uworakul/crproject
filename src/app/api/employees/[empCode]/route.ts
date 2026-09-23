import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction, computeDiff } from "@/lib/audit-log";
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

// Same idea for the ธภ.7 checklist booleans — only a real boolean is
// accepted, anything else (including omission) leaves the stored value
// untouched rather than guessing.
function optBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
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
    tbor7Topic1?: unknown;
    tbor7Topic2?: unknown;
    tbor7Topic3?: unknown;
    tbor7Topic4?: unknown;
    tbor7Topic5?: unknown;
    tbor7Topic6?: unknown;
    tbor7Topic7?: unknown;
    tbor7Topic8?: unknown;
    tbor7Topic9?: unknown;
    tbor7Topic10?: unknown;
    tbor7Remark?: unknown;
    addressHouseNo?: unknown;
    addressMoo?: unknown;
    addressSoi?: unknown;
    addressRoad?: unknown;
    addressTambon?: unknown;
    addressAmphoe?: unknown;
    addressProvince?: unknown;
    addressZipCode?: unknown;
    referencePerson1Name?: unknown;
    referencePerson2Name?: unknown;
    ssoHospitalName?: unknown;
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
      Tbor7Topic1: optBool(body.tbor7Topic1),
      Tbor7Topic2: optBool(body.tbor7Topic2),
      Tbor7Topic3: optBool(body.tbor7Topic3),
      Tbor7Topic4: optBool(body.tbor7Topic4),
      Tbor7Topic5: optBool(body.tbor7Topic5),
      Tbor7Topic6: optBool(body.tbor7Topic6),
      Tbor7Topic7: optBool(body.tbor7Topic7),
      Tbor7Topic8: optBool(body.tbor7Topic8),
      Tbor7Topic9: optBool(body.tbor7Topic9),
      Tbor7Topic10: optBool(body.tbor7Topic10),
      Tbor7Remark: optStr(body.tbor7Remark),
      AddressHouseNo: optStr(body.addressHouseNo),
      AddressMoo: optStr(body.addressMoo),
      AddressSoi: optStr(body.addressSoi),
      AddressRoad: optStr(body.addressRoad),
      AddressTambon: optStr(body.addressTambon),
      AddressAmphoe: optStr(body.addressAmphoe),
      AddressProvince: optStr(body.addressProvince),
      AddressZipCode: optStr(body.addressZipCode),
      ReferencePerson1Name: optStr(body.referencePerson1Name),
      ReferencePerson2Name: optStr(body.referencePerson2Name),
      SSOHospitalName: optStr(body.ssoHospitalName),
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_EMPLOYEE", {
    targetTable: "mst_employee",
    targetId: empCode,
    changes: computeDiff(existing, updated),
  });
  return apiSuccess(updated);
}

// Hard delete (2026-09-19, replaces the earlier soft-delete/IsActive=false
// design at the user's explicit request — a "deleted" employee showing up
// as "ระงับ" in the list wasn't acceptable). A reason is still required and
// is recorded in sys_process_log (Detail + a full-row Changes diff, since
// this is the only surviving record of the row's data once it's gone —
// sys_process_log has no FK to mst_employee, so it isn't affected by the
// delete). Normal offboarding is still the separate "resign" action
// (EmployeeStatus=RESIGNED + ResignDate), which this does not replace.
//
// Only rows fully "owned" by the employee (quota, work/training
// experience, notes) are cascade-deleted alongside it — real transactional
// history (worksheet, payroll, leave, requests, inventory movements/debt)
// still has a NO ACTION FK and blocks the delete, caught below and
// surfaced as 409 EMPLOYEE_IN_USE rather than a raw 500.
export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/employees/[empCode]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "delete");
  if (denied) return denied;

  const { empCode } = await ctx.params;
  const existing = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!existing) return apiError(404, "EMPLOYEE_NOT_FOUND");

  let body: { reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return apiError(400, "INVALID_PARAMS", "reason is required");

  try {
    await prisma.$transaction([
      prisma.mstEmployeeQuota.deleteMany({ where: { EmpCode: empCode } }),
      prisma.mstEmployeeWorkExperience.deleteMany({ where: { EmpCode: empCode } }),
      prisma.mstEmployeeTrainingExperience.deleteMany({ where: { EmpCode: empCode } }),
      prisma.mstEmployeeHistory.deleteMany({ where: { EmpCode: empCode } }),
      prisma.mstEmployee.delete({ where: { EmpCode: empCode } }),
    ]);
  } catch {
    return apiError(
      409,
      "EMPLOYEE_IN_USE",
      "พนักงานคนนี้มีประวัติการทำงาน/ใบลงเวลา/เงินเดือน/การลา/คำขอ ที่เกี่ยวข้องอยู่ในระบบ ไม่สามารถลบได้",
    );
  }

  await logAction(user.userId, "DELETE_EMPLOYEE", {
    targetTable: "mst_employee",
    targetId: empCode,
    detail: reason,
    changes: computeDiff(existing, {}),
  });
  return apiSuccess({ ok: true });
}
