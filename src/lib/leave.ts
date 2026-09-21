// No "server-only" guard — LEAVE_STATUS_VALUES is also useful client-side.
// REJECTED is kept as a valid enum value only for historical rows written
// before 2026-09-21 (back when reject was terminal) — new code never writes
// it anymore; reject now bounces Status back to DRAFT with RejectReason set,
// same convention as trn_request_header (see leaveIsAwaitingResubmit below).
export const LEAVE_STATUS_VALUES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const;
export type LeaveStatus = (typeof LEAVE_STATUS_VALUES)[number];

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  DRAFT: "ร่าง",
  SUBMITTED: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
};

// A DRAFT row with a RejectReason still attached is one that was bounced
// back and not yet resubmitted — display it as "ไม่อนุมัติ" (red) instead of
// a plain new draft. Once resubmitted, Status moves to SUBMITTED and this
// stops matching even though RejectReason is still there as audit trail.
export function leaveIsAwaitingResubmit(status: string, rejectReason: string | null | undefined): boolean {
  return status === "DRAFT" && !!rejectReason;
}

// mst_leave_type.EligibleEmployeeType: null = every EmployeeType may request
// this leave type; a value ("DAILY"/"MONTHLY") restricts it to only that one.
export function isLeaveTypeEligible(eligibleEmployeeType: string | null | undefined, employeeType: string): boolean {
  return !eligibleEmployeeType || eligibleEmployeeType === employeeType;
}

// 8 hours = 1 day, per company policy confirmed 2026-09-21 (standard Thai
// working-hours convention, 09:00-17:00 minus lunch break). Used to convert
// an hourly leave request into the canonical day-equivalent TotalDays that
// balance checks compare against.
export const LEAVE_HOURS_PER_DAY = 8;

// mst_leave_type.TenureCountFrom (only meaningful when BasedOnTenure=true) —
// which mst_employee date field "years of service" counts from.
export const LEAVE_TENURE_COUNT_FROM_VALUES = ["START_DATE", "PROBATION_PASS_DATE"] as const;
export type LeaveTenureCountFrom = (typeof LEAVE_TENURE_COUNT_FROM_VALUES)[number];
export const LEAVE_TENURE_COUNT_FROM_LABELS: Record<LeaveTenureCountFrom, string> = {
  START_DATE: "วันเริ่มงาน",
  PROBATION_PASS_DATE: "วันที่ผ่านงาน",
};
export function isValidTenureCountFrom(value: unknown): value is LeaveTenureCountFrom {
  return typeof value === "string" && (LEAVE_TENURE_COUNT_FROM_VALUES as readonly string[]).includes(value);
}

// Completed whole years between a base date (StartDate or ProbationPassDate)
// and an "as of" reference date — floor, not round (1 year 11 months = 1,
// not 2). Assumption made 2026-09-21 without an explicit answer from the
// user: entitlement for a given calendar Year is computed "as of Jan 1 of
// that Year" (see getLeaveBalanceSummary in src/lib/leave-balance.ts) so it
// stays constant across every leave request filed within the same year,
// rather than shifting per request date — standard annual-entitlement-reset
// practice. Flag to the user if this doesn't match their actual policy.
export function wholeYearsOfService(baseDate: Date, asOf: Date): number {
  let years = asOf.getUTCFullYear() - baseDate.getUTCFullYear();
  const asOfMonthDay = asOf.getUTCMonth() * 100 + asOf.getUTCDate();
  const baseMonthDay = baseDate.getUTCMonth() * 100 + baseDate.getUTCDate();
  if (asOfMonthDay < baseMonthDay) years -= 1;
  return Math.max(0, years);
}
