// No "server-only" guard — these constants are also used client-side (form dropdowns).
export const REQUEST_TYPE_VALUES = ["ADVANCE", "LOAN", "TRAINING"] as const;
export type RequestType = (typeof REQUEST_TYPE_VALUES)[number];

// trn_request.RequestType -> sys_menu.DocumentType, one per type (matches
// the 3 separate DocumentTypes seeded: REQUEST_ADVANCE/REQUEST_LOAN/REQUEST_TRAINING).
export const REQUEST_TYPE_DOCTYPE: Record<RequestType, string> = {
  ADVANCE: "REQUEST_ADVANCE",
  LOAN: "REQUEST_LOAN",
  TRAINING: "REQUEST_TRAINING",
};

export function isValidRequestType(value: unknown): value is RequestType {
  return typeof value === "string" && (REQUEST_TYPE_VALUES as readonly string[]).includes(value);
}

// mst_employee_quota.QuotaType only has ADVANCE/LOAN/UNIFORM/SERVICE/INSURANCE
// (see the DDL CHECK constraint) — TRAINING has no matching quota row at
// all, so a Training request never touches mst_employee_quota on approve.
export function quotaTypeForRequest(type: RequestType): "ADVANCE" | "LOAN" | null {
  if (type === "ADVANCE") return "ADVANCE";
  if (type === "LOAN") return "LOAN";
  return null;
}
