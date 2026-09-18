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

// mst_employee.EmployeeStatus CHECK constraint.
export const EMPLOYEE_STATUS_VALUES = ["ACTIVE", "RESIGNED"] as const;

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
  GENERAL: "ทั่วไป",
  ADMIN: "ธุรการ",
  FINANCE: "การเงิน",
};
export function isValidMemoType(value: unknown): value is MemoType {
  return typeof value === "string" && (MEMO_TYPE_VALUES as readonly string[]).includes(value);
}
