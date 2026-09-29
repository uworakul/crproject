import "server-only";
import { prisma } from "@/lib/prisma";
import { EMPLOYEE_STATUS_LABELS, type EmployeeStatus } from "@/lib/validation";
import { downloadFileFromR2 } from "@/lib/r2";
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
// (PhotoPath, a Cloudflare R2 object key) is deliberately not embedded in
// this round — see CLAUDE.md, that integration has its own failure modes
// (R2 credentials not yet configured) and wasn't part of what was asked for
// here.
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

// ประวัติพนักงาน (2026-09-29) — matches the legacy "ประวัติพนักงานรักษาความ
// ปลอดภัย" template the user uploaded: one fixed-layout profile page per
// employee with a photo, unlike การ์ดพนักงาน's toggleable sections above.
// Field mapping decisions not explicit in the template, documented here
// rather than guessed silently:
//   - "ที่อยู่ตามทะเบียนบ้าน" -> IDCardAddress (permanent/registered address),
//     "ที่อยู่ปัจจุบัน" -> Address (current address) — these are the two
//     distinct address fields on mst_employee and match the labels' meaning.
//   - The template's single ใบอนุญาต checkbox group (ไม่มี/มี/ธภ.6) doesn't
//     map cleanly onto this schema's two INDEPENDENT optional license
//     records (No6/Date6, No7/Date7) — rendered as two separate มี/ไม่มี
//     status lines instead (see employee-profile-pdf.tsx) rather than
//     forcing an ambiguous tri-state checkbox.
export interface EmployeeProfileData {
  empCode: string;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  positionName: string | null;
  height: string | null;
  weight: string | null;
  birthDate: string | null;
  age: number | null;
  permanentAddress: string | null; // ที่อยู่ตามทะเบียนบ้าน
  currentAddress: string | null; // ที่อยู่ปัจจุบัน
  phoneNo: string | null;
  distinguishingMarks: string | null; // รูปพรรณสัณฐาน
  referencePerson1Name: string | null;
  referencePerson2Name: string | null;
  trainingExperience: { organization: string; topic: string | null; duration: string | null }[];
  licenseNo6: string | null;
  licenseDate6: string | null;
  licenseNo7: string | null;
  licenseDate7: string | null;
  photoDataUri: string | null; // base64 data URI; null if no photo, unsupported format, or R2 fetch failed
}

export async function getEmployeeProfiles(filters: ReportFilters): Promise<EmployeeProfileData[]> {
  const employees = await prisma.mstEmployee.findMany({
    where: employeeWhere(filters),
    include: { Position: true, TrainingExperiences: { orderBy: { TrainingExperienceID: "asc" } } },
    orderBy: { EmpCode: "asc" },
  });

  // Each photo is fetched independently and failures are swallowed to
  // `null` (never thrown) — one employee's missing/broken photo must not
  // abort the whole batch's report generation. @react-pdf/renderer also
  // can't reliably decode WEBP (only JPEG/PNG), even though the upload
  // endpoint accepts it, so that format is deliberately excluded here
  // BEFORE it ever reaches the PDF tree — an unsupported format reaching
  // <Image> would throw inside renderToBuffer() and fail every employee in
  // the run, not just the one with the bad photo.
  const photoDataUris = await Promise.all(
    employees.map(async (e) => {
      if (!e.PhotoPath) return null;
      try {
        const { data, mimeType } = await downloadFileFromR2(e.PhotoPath);
        if (mimeType !== "image/jpeg" && mimeType !== "image/png") return null;
        return `data:${mimeType};base64,${data.toString("base64")}`;
      } catch {
        return null;
      }
    }),
  );

  return employees.map((e, i) => ({
    empCode: e.EmpCode,
    title: e.Title,
    firstName: e.FirstName,
    lastName: e.LastName,
    fullName: e.FullName,
    positionName: e.Position?.PositionName ?? null,
    height: e.Height?.toString() ?? null,
    weight: e.Weight?.toString() ?? null,
    birthDate: e.BirthDate?.toLocaleDateString("th-TH") ?? null,
    age: calculateAge(e.BirthDate),
    permanentAddress: e.IDCardAddress,
    currentAddress: e.Address,
    phoneNo: e.PhoneNo,
    distinguishingMarks: e.DistinguishingMarks,
    referencePerson1Name: e.ReferencePerson1Name,
    referencePerson2Name: e.ReferencePerson2Name,
    trainingExperience: e.TrainingExperiences.map((t) => ({ organization: t.Organization, topic: t.Topic, duration: t.Duration })),
    licenseNo6: e.LicenseNo6,
    licenseDate6: e.LicenseDate6?.toLocaleDateString("th-TH") ?? null,
    licenseNo7: e.LicenseNo7,
    licenseDate7: e.LicenseDate7?.toLocaleDateString("th-TH") ?? null,
    photoDataUri: photoDataUris[i],
  }));
}

// สัญญาไม่เปิดเผยข้อมูลความลับ (NDA, 2026-09-29) — one contract per employee,
// pre-filled from ref_company (บริษัท/ผู้มีอำนาจลงนาม/ที่อยู่แยกส่วน) and
// mst_employee. Anything the schema doesn't hold (the signer's age/
// nationality/ID card, the signing date) is left as dotted blanks for
// handwriting, exactly like the paper template — never guessed.
export interface NdaData {
  company: {
    name: string;
    signerName: string | null;
    signerPosition: string | null;
    registeredDate: string | null;
    registeredProvince: string | null;
    addressParts: { houseNo: string | null; floor: string | null; moo: string | null; soi: string | null; road: string | null; tambon: string | null; amphoe: string | null; province: string | null; zipCode: string | null };
    addressFallback: string | null;
  };
  employee: {
    empCode: string;
    displayName: string;
    age: number | null;
    nationality: string | null;
    addressParts: { houseNo: string | null; moo: string | null; soi: string | null; road: string | null; tambon: string | null; amphoe: string | null; province: string | null; zipCode: string | null };
    addressFallback: string | null;
    idCardNo: string;
    positionName: string | null;
    startDate: string;
  };
}

// แบบ ธ.ภ.6 (คำขอรับใบอนุญาตเป็นพนักงานรักษาความปลอดภัยรับอนุญาต) —
// applicant part is pre-filled from mst_employee + ref_company; the photo
// is embedded the same way as ประวัติพนักงาน (JPEG/PNG only, failures
// swallowed to null so one bad photo can't abort a whole batch).
export interface Tbor6Data {
  applicantName: string;
  age: number | null;
  nationality: string | null;
  bloodType: string | null;
  idCardNo: string;
  addressParts: NdaData["employee"]["addressParts"];
  addressFallback: string | null;
  phoneNo: string | null;
  photoDataUri: string | null;
  company: NdaData["company"] & { licenseNo: string | null; phone: string | null };
}

export async function getTbor6Forms(filters: ReportFilters): Promise<Tbor6Data[]> {
  const employees = await prisma.mstEmployee.findMany({ where: employeeWhere(filters), include: { Company: true }, orderBy: { EmpCode: "asc" } });
  const defaultCompany = await prisma.refCompany.findFirst({ orderBy: { CompanyCode: "asc" } });
  const photos = await Promise.all(
    employees.map(async (e) => {
      if (!e.PhotoPath) return null;
      try {
        const { data, mimeType } = await downloadFileFromR2(e.PhotoPath);
        if (mimeType !== "image/jpeg" && mimeType !== "image/png") return null;
        return `data:${mimeType};base64,${data.toString("base64")}`;
      } catch {
        return null;
      }
    }),
  );
  return employees.map((e, i) => {
    const c = e.Company ?? defaultCompany;
    return {
      applicantName: e.FirstName || e.LastName ? [e.Title, e.FirstName, e.LastName].filter(Boolean).join(" ") : e.FullName,
      age: calculateAge(e.BirthDate),
      nationality: e.Nationality,
      bloodType: e.BloodType,
      idCardNo: e.IDCardNo,
      addressParts: { houseNo: e.AddressHouseNo, moo: e.AddressMoo, soi: e.AddressSoi, road: e.AddressRoad, tambon: e.AddressTambon, amphoe: e.AddressAmphoe, province: e.AddressProvince, zipCode: e.AddressZipCode },
      addressFallback: e.Address,
      phoneNo: e.PhoneNo,
      photoDataUri: photos[i],
      company: {
        name: c?.CompanyName ?? "",
        signerName: c?.AuthorizedSignerName ?? null,
        signerPosition: c?.AuthorizedSignerPosition ?? null,
        registeredDate: null,
        registeredProvince: c?.RegisteredProvince ?? null,
        addressParts: {
          houseNo: c?.AddressHouseNo ?? null,
          floor: c?.AddressFloor ?? null,
          moo: c?.AddressMoo ?? null,
          soi: c?.AddressSoi ?? null,
          road: c?.AddressRoad ?? null,
          tambon: c?.AddressTambon ?? null,
          amphoe: c?.AddressAmphoe ?? null,
          province: c?.AddressProvince ?? null,
          zipCode: c?.AddressZipCode ?? null,
        },
        addressFallback: c?.Address ?? null,
        licenseNo: c?.SecurityBusinessLicenseNo ?? null,
        phone: c?.ContactPhone ?? null,
      },
    };
  });
}

export async function getNdaContracts(filters: ReportFilters): Promise<NdaData[]> {
  const employees = await prisma.mstEmployee.findMany({
    where: employeeWhere(filters),
    include: { Position: true, Company: true },
    orderBy: { EmpCode: "asc" },
  });
  const defaultCompany = await prisma.refCompany.findFirst({ orderBy: { CompanyCode: "asc" } });
  return employees.map((e) => {
    const c = e.Company ?? defaultCompany;
    const displayName = e.FirstName || e.LastName ? [e.Title, e.FirstName, e.LastName].filter(Boolean).join(" ") : e.FullName;
    return {
      company: {
        name: c?.CompanyName ?? "",
        signerName: c?.AuthorizedSignerName ?? null,
        signerPosition: c?.AuthorizedSignerPosition ?? null,
        registeredDate: c?.RegisteredDate?.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }) ?? null,
        registeredProvince: c?.RegisteredProvince ?? null,
        addressParts: {
          houseNo: c?.AddressHouseNo ?? null,
          floor: c?.AddressFloor ?? null,
          moo: c?.AddressMoo ?? null,
          soi: c?.AddressSoi ?? null,
          road: c?.AddressRoad ?? null,
          tambon: c?.AddressTambon ?? null,
          amphoe: c?.AddressAmphoe ?? null,
          province: c?.AddressProvince ?? null,
          zipCode: c?.AddressZipCode ?? null,
        },
        addressFallback: c?.Address ?? null,
      },
      employee: {
        empCode: e.EmpCode,
        displayName,
        age: calculateAge(e.BirthDate),
        nationality: e.Nationality,
        addressParts: {
          houseNo: e.AddressHouseNo,
          moo: e.AddressMoo,
          soi: e.AddressSoi,
          road: e.AddressRoad,
          tambon: e.AddressTambon,
          amphoe: e.AddressAmphoe,
          province: e.AddressProvince,
          zipCode: e.AddressZipCode,
        },
        addressFallback: e.Address,
        idCardNo: e.IDCardNo,
        positionName: e.Position?.PositionName ?? null,
        startDate: e.StartDate.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }),
      },
    };
  });
}
