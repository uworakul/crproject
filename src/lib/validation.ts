// Mirrors CHECK constraints from the approved DDL — Prisma can't enforce
// these declaratively, so the API validates before hitting the DB to give a
// clean 400 instead of a raw constraint-violation 500.
export const ROLE_VALUES = ["SITE_HEAD", "APPROVER", "ADMIN", "PAYROLL", "HR", "STORE"] as const;
export type Role = (typeof ROLE_VALUES)[number];

export function isValidRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLE_VALUES as readonly string[]).includes(value);
}
