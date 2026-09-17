// No "server-only" guard — LEAVE_STATUS_VALUES is also useful client-side.
export const LEAVE_STATUS_VALUES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const;
export type LeaveStatus = (typeof LEAVE_STATUS_VALUES)[number];

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  DRAFT: "ร่าง",
  SUBMITTED: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
};
