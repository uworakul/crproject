import "server-only";
import { prisma } from "@/lib/prisma";
import { EMPLOYEE_STATUS_LABELS, type EmployeeStatus } from "@/lib/validation";
import { employeeWhere, type ReportFilters } from "./types";
import type { GroupableRow } from "./group-sort";

function calculateAge(birthDate: Date | null, asOf: Date = new Date()): number | null {
  if (!birthDate) return null;
  let age = asOf.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear = asOf.getMonth() > birthDate.getMonth() || (asOf.getMonth() === birthDate.getMonth() && asOf.getDate() >= birthDate.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

// 2026-09-23 — rebuilt to match the exact columns of the user's legacy
// "รายงานทะเบียนพนักงาน" export (ลำดับ/รหัสพนักงาน/เลขบัตรประชาชน/คำนำหน้า/
// ชื่อ/นามสกุล/วันเกิด/เริ่มงาน/อายุ/สิ้นสุดการจ้าง/สถานะ/ที่อยู่ปัจจุบัน/เพศ/
// สัญชาติ/หน่วยงาน/สิทธิรักษา) — replacing the earlier ad-hoc column set.
// "สิทธิรักษา" = SSOHospitalName (confirmed with the user: the employee's
// designated Social Security hospital, not "healthcare rights" in general).
export interface EmployeeRegistryRow extends GroupableRow {
  idCardNo: string;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  age: number | null;
  startDate: string;
  resignDate: string | null;
  status: string;
  address: string | null;
  gender: string | null;
  nationality: string | null;
  ssoHospitalName: string | null;
}

// ทะเบียนพนักงาน — a flat listing, point-in-time (no period dimension at
// all: this is "who is currently on file", not a payroll-run artifact).
export async function getEmployeeRegistryRows(filters: ReportFilters): Promise<EmployeeRegistryRow[]> {
  const employees = await prisma.mstEmployee.findMany({
    where: employeeWhere(filters),
    include: { Department: true, Site: true, Bank: true },
    orderBy: { EmpCode: "asc" },
  });
  return employees.map((e) => ({
    empCode: e.EmpCode,
    fullName: e.FullName,
    deptCode: e.DeptCode,
    deptName: e.Department?.DeptName ?? null,
    siteCode: e.DefaultSiteCode,
    siteName: e.Site?.SiteName ?? null,
    bankCode: e.BankCode,
    bankName: e.Bank?.BankNameTH ?? null,
    employeeType: e.EmployeeType,
    idCardNo: e.IDCardNo,
    title: e.Title,
    firstName: e.FirstName,
    lastName: e.LastName,
    birthDate: e.BirthDate?.toLocaleDateString("th-TH") ?? null,
    age: calculateAge(e.BirthDate),
    startDate: e.StartDate.toLocaleDateString("th-TH"),
    resignDate: e.ResignDate?.toLocaleDateString("th-TH") ?? null,
    status: EMPLOYEE_STATUS_LABELS[e.EmployeeStatus as EmployeeStatus] ?? e.EmployeeStatus,
    address: e.Address,
    gender: e.Gender,
    nationality: e.Nationality,
    ssoHospitalName: e.SSOHospitalName,
  }));
}

// 2026-09-23 — "การ์ดพนักงาน" split into the same 6 sections the employee
// detail page's own tabs already use (ข้อมูลพนักงาน/ข้อมูลส่วนบุคคล/ประวัติ
// ทำงาน/ประวัติการฝึกอบรม/ประวัติการลาในปี/ธภ.7), user-selectable per print
// run via the `sections` filter — so the PDF only pulls/renders exactly
// what was asked for. "บริษัท" is deliberately NOT one of these fields
// anymore (removed at the user's request — it duplicated the report's own
// company-name header).
export const EMPLOYEE_CARD_SECTIONS = ["EMPLOYEE_INFO", "PERSONAL_INFO", "WORK_EXPERIENCE", "TRAINING_EXPERIENCE", "LEAVE_HISTORY", "TBOR7"] as const;
export type EmployeeCardSection = (typeof EMPLOYEE_CARD_SECTIONS)[number];

export interface EmployeeCardData {
  empCode: string;
  fullName: string;
  title: string | null;
  // ข้อมูลพนักงาน
  deptName: string | null;
  positionName: string | null;
  siteName: string | null;
  employeeType: string;
  startDate: string;
  status: string;
  bankName: string | null;
  bankAccountNo: string | null;
  licenseNo6: string | null;
  licenseDate6: string | null;
  licenseNo7: string | null;
  licenseDate7: string | null;
  // ข้อมูลส่วนบุคคล
  idCardNo: string;
  birthDate: string | null;
  address: string | null;
  phoneNo: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  guarantorName: string | null;
  bloodType: string | null;
  height: string | null;
  weight: string | null;
  bodyType: string | null;
  gender: string | null;
  nationality: string | null;
  education: string | null;
  // ประวัติทำงาน / ประวัติการฝึกอบรม
  workExperience: { companyName: string; positionName: string | null; startDate: string | null; endDate: string | null }[];
  trainingExperience: { organization: string; topic: string | null; duration: string | null }[];
  // ประวัติการลาในปี (ปีที่ระบุผ่าน leaveYear, ค.ศ.)
  leaveHistory: { leaveTypeName: string; startDate: string; endDate: string; totalDays: string; status: string }[];
  // ธภ.7
  tbor7Topics: boolean[]; // index 0-9 = หัวข้อ 1-10
  tbor7Remark: string | null;
}

// การ์ดพนักงาน — one full profile per employee (not a table row), so this
// intentionally pulls far more fields than the registry above. Photo
// (PhotoPath, a Google Drive file ID) is deliberately not embedded in this
// round — see CLAUDE.md, that integration has its own failure modes
// (GOOGLE_SERVICE_ACCOUNT_KEY not yet configured) and wasn't part of what
// was asked for here.
export async function getEmployeeCards(filters: ReportFilters, leaveYear?: number): Promise<EmployeeCardData[]> {
  const employees = await prisma.mstEmployee.findMany({
    where: employeeWhere(filters),
    include: {
      Department: true,
      Position: true,
      Site: true,
      Bank: true,
      WorkExperiences: { orderBy: { WorkExperienceID: "asc" } },
      TrainingExperiences: { orderBy: { TrainingExperienceID: "asc" } },
      // leaveYear undefined -> filter on a year with no real data (SQL
      // Server's DATE type only supports 0001-9999, so year 1 rather than 0
      // or a negative year — those fail the mssql driver's date conversion
      // outright) instead of branching the include's shape conditionally,
      // which Prisma's generated types can't express as a stable union
      // (LeaveType would be absent in a `false` branch).
      LeaveRequests: {
        where: { Status: "APPROVED", StartDate: { gte: new Date(Date.UTC(leaveYear ?? 1, 0, 1)), lte: new Date(Date.UTC(leaveYear ?? 1, 11, 31)) } },
        include: { LeaveType: true },
        orderBy: { StartDate: "asc" },
      },
    },
    orderBy: { EmpCode: "asc" },
  });

  return employees.map((e) => ({
    empCode: e.EmpCode,
    fullName: e.FullName,
    title: e.Title,
    deptName: e.Department?.DeptName ?? null,
    positionName: e.Position?.PositionName ?? null,
    siteName: e.Site?.SiteName ?? null,
    employeeType: e.EmployeeType,
    startDate: e.StartDate.toLocaleDateString("th-TH"),
    status: EMPLOYEE_STATUS_LABELS[e.EmployeeStatus as EmployeeStatus] ?? e.EmployeeStatus,
    bankName: e.Bank?.BankNameTH ?? null,
    bankAccountNo: e.BankAccountNo,
    licenseNo6: e.LicenseNo6,
    licenseDate6: e.LicenseDate6?.toLocaleDateString("th-TH") ?? null,
    licenseNo7: e.LicenseNo7,
    licenseDate7: e.LicenseDate7?.toLocaleDateString("th-TH") ?? null,
    idCardNo: e.IDCardNo,
    birthDate: e.BirthDate?.toLocaleDateString("th-TH") ?? null,
    address: e.Address,
    phoneNo: e.PhoneNo,
    emergencyContactName: e.EmergencyContactName,
    emergencyContactPhone: e.EmergencyContactPhone,
    guarantorName: e.GuarantorName,
    bloodType: e.BloodType,
    height: e.Height?.toString() ?? null,
    weight: e.Weight?.toString() ?? null,
    bodyType: e.BodyType,
    gender: e.Gender,
    nationality: e.Nationality,
    education: e.Education,
    workExperience: e.WorkExperiences.map((w) => ({
      companyName: w.CompanyName,
      positionName: w.PositionName,
      startDate: w.StartDate?.toLocaleDateString("th-TH") ?? null,
      endDate: w.EndDate?.toLocaleDateString("th-TH") ?? null,
    })),
    trainingExperience: e.TrainingExperiences.map((t) => ({ organization: t.Organization, topic: t.Topic, duration: t.Duration })),
    leaveHistory: e.LeaveRequests.map((l) => ({
      leaveTypeName: l.LeaveType.LeaveTypeName,
      startDate: l.StartDate.toLocaleDateString("th-TH"),
      endDate: l.EndDate.toLocaleDateString("th-TH"),
      totalDays: l.TotalDays.toFixed(2),
      status: l.Status,
    })),
    tbor7Topics: [
      e.Tbor7Topic1 ?? false,
      e.Tbor7Topic2 ?? false,
      e.Tbor7Topic3 ?? false,
      e.Tbor7Topic4 ?? false,
      e.Tbor7Topic5 ?? false,
      e.Tbor7Topic6 ?? false,
      e.Tbor7Topic7 ?? false,
      e.Tbor7Topic8 ?? false,
      e.Tbor7Topic9 ?? false,
      e.Tbor7Topic10 ?? false,
    ],
    tbor7Remark: e.Tbor7Remark,
  }));
}
