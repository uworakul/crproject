// Mirrors CHECK constraints from the approved DDL — Prisma can't enforce
// these declaratively, so the API validates before hitting the DB to give a
// clean 400 instead of a raw constraint-violation 500.
export const ROLE_VALUES = ["SITE_HEAD", "APPROVER", "ADMIN", "PAYROLL", "HR", "STORE"] as const;
export type Role = (typeof ROLE_VALUES)[number];

export function isValidRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLE_VALUES as readonly string[]).includes(value);
}

// mst_employee.EmployeeType has no CHECK constraint in the DDL (free
// VARCHAR(20)), but it MUST line up with sys_period.EmployeeType or
// Worksheet's approve step can't find a matching period to post against
// (see approveWorksheet() in src/lib/worksheet.ts). Originally BR-005's 4
// categories (province × pay frequency); simplified 2026-09-18 at the
// user's request to just pay frequency — kept here as the one shared source
// both Employee Master and Period Setup read from.
export const EMPLOYEE_TYPE_VALUES = ["DAILY", "MONTHLY"] as const;
export type EmployeeType = (typeof EMPLOYEE_TYPE_VALUES)[number];

export const EMPLOYEE_TYPE_LABELS: Record<EmployeeType, string> = {
  DAILY: "รายวัน",
  MONTHLY: "รายเดือน",
};

export function isValidEmployeeType(value: unknown): value is EmployeeType {
  return typeof value === "string" && (EMPLOYEE_TYPE_VALUES as readonly string[]).includes(value);
}

// mst_employee.EmployeeStatus CHECK constraint — expanded 2026-09-19.
// "ACTIVE" is kept as the DB value for "ปกติ" (not renamed to e.g. "NORMAL")
// because 4 existing pages (inventory issue/return, leave request/balances)
// filter employees by the literal string "ACTIVE"; renaming it would silently
// break those dropdowns for every existing employee row.
export const EMPLOYEE_STATUS_VALUES = ["ACTIVE", "PROBATION", "SUSPENDED", "TERMINATED", "RESIGNED"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUS_VALUES)[number];
export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: "ปกติ",
  PROBATION: "ทดลองงาน",
  SUSPENDED: "พักงาน",
  TERMINATED: "เลิกจ้าง",
  RESIGNED: "ลาออก",
};
export function isValidEmployeeStatus(value: unknown): value is EmployeeStatus {
  return typeof value === "string" && (EMPLOYEE_STATUS_VALUES as readonly string[]).includes(value);
}

// mst_employee.MaritalStatus — informational only, no DB CHECK.
export const MARITAL_STATUS_VALUES = ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED"] as const;
export type MaritalStatus = (typeof MARITAL_STATUS_VALUES)[number];
export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  SINGLE: "โสด",
  MARRIED: "สมรส",
  DIVORCED: "หย่าร้าง",
  WIDOWED: "หม้าย",
};

// mst_employee.Gender — informational only, no DB CHECK.
export const GENDER_VALUES = ["MALE", "FEMALE", "OTHER"] as const;
export type Gender = (typeof GENDER_VALUES)[number];
export const GENDER_LABELS: Record<Gender, string> = {
  MALE: "ชาย",
  FEMALE: "หญิง",
  OTHER: "อื่นๆ",
};

// mst_employee.Education — informational only, no DB CHECK.
export const EDUCATION_LEVEL_VALUES = ["NONE", "PRIMARY", "SECONDARY", "MIDDLE_SCHOOL", "HIGH_SCHOOL", "VOC_CERT", "VOC_DIPLOMA", "BACHELOR", "OTHER"] as const;
export type EducationLevel = (typeof EDUCATION_LEVEL_VALUES)[number];
export const EDUCATION_LEVEL_LABELS: Record<EducationLevel, string> = {
  NONE: "ไม่มี",
  PRIMARY: "ป.ต้น",
  SECONDARY: "ป.ปลาย",
  MIDDLE_SCHOOL: "ม.ต้น",
  HIGH_SCHOOL: "ม.ปลาย",
  VOC_CERT: "ปวช",
  VOC_DIPLOMA: "ปวส",
  BACHELOR: "ป.ตรี",
  OTHER: "อื่นๆ",
};

// inv_product.UnitOfMeasure — informational only (no DB CHECK, free
// NVARCHAR), values are the Thai unit labels themselves so no code<->label
// translation table is needed like the other dropdowns above.
export const UNIT_OF_MEASURE_VALUES = ["ตัว", "ชุด", "ชิ้น", "อัน", "ด้าม", "คู่", "ใบ", "อื่นๆ"] as const;

// mst_employee_quota.QuotaType CHECK constraint.
export const QUOTA_TYPE_VALUES = ["ADVANCE", "LOAN", "UNIFORM", "SERVICE", "INSURANCE"] as const;
export type QuotaType = (typeof QUOTA_TYPE_VALUES)[number];
export const QUOTA_TYPE_LABELS: Record<QuotaType, string> = {
  ADVANCE: "เบิกล่วงหน้า",
  LOAN: "เงินกู้",
  UNIFORM: "เครื่องแบบ",
  SERVICE: "ค่าบริการ",
  INSURANCE: "เงินประกัน",
};
export function isValidQuotaType(value: unknown): value is QuotaType {
  return typeof value === "string" && (QUOTA_TYPE_VALUES as readonly string[]).includes(value);
}

// mst_employee_history.MemoType CHECK constraint.
export const MEMO_TYPE_VALUES = ["GENERAL", "ADMIN", "FINANCE"] as const;
export type MemoType = (typeof MEMO_TYPE_VALUES)[number];
export const MEMO_TYPE_LABELS: Record<MemoType, string> = {
  GENERAL: "บุคคล",
  ADMIN: "ธุรการ",
  FINANCE: "การเงิน",
};
export function isValidMemoType(value: unknown): value is MemoType {
  return typeof value === "string" && (MEMO_TYPE_VALUES as readonly string[]).includes(value);
}
