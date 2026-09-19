// No "server-only" guard — these constants are also used client-side (form dropdowns).

// Document codes shown in the "รหัสเอกสาร" dropdown (2026-09-19, replaces
// the old 1:1 RequestType model). ADVANCEN/ADVANCEU are separate advance
// categories split by purpose per the user's own request — all three still
// map to the same REQUEST_ADVANCE permission group and the same underlying
// business flow as plain ADVANCE, just with their own document-number
// sequence and label for tracking/printing.
export const REQUEST_DOCUMENT_CODE_VALUES = ["ADVANCE", "ADVANCEN", "ADVANCEU", "LOAN", "TRAINING"] as const;
export type RequestDocumentCode = (typeof REQUEST_DOCUMENT_CODE_VALUES)[number];

export function isValidRequestDocumentCode(value: unknown): value is RequestDocumentCode {
  return typeof value === "string" && (REQUEST_DOCUMENT_CODE_VALUES as readonly string[]).includes(value);
}

// DocumentCode -> which of the 3 existing sys_menu/permission DocumentTypes
// (REQUEST_ADVANCE/REQUEST_LOAN/REQUEST_TRAINING) governs it — kept as a
// 3-way split (not one per DocumentCode) so already-granted permissions
// keep working exactly as before.
export const REQUEST_DOCUMENT_DOCTYPE: Record<RequestDocumentCode, string> = {
  ADVANCE: "REQUEST_ADVANCE",
  ADVANCEN: "REQUEST_ADVANCE",
  ADVANCEU: "REQUEST_ADVANCE",
  LOAN: "REQUEST_LOAN",
  TRAINING: "REQUEST_TRAINING",
};

// The 3 permission groups themselves, for pages that need to enumerate
// them (list page tabs, draft-list visibility) — order matters for tab order.
export const REQUEST_PERMISSION_GROUPS = [
  { docType: "REQUEST_ADVANCE", label: "เบิกล่วงหน้า", documentCodes: ["ADVANCE", "ADVANCEN", "ADVANCEU"] as RequestDocumentCode[] },
  { docType: "REQUEST_LOAN", label: "เงินกู้", documentCodes: ["LOAN"] as RequestDocumentCode[] },
  { docType: "REQUEST_TRAINING", label: "ค่าอบรม", documentCodes: ["TRAINING"] as RequestDocumentCode[] },
] as const;

// Display name shown next to each code in the "รหัสเอกสาร" dropdown
// (2026-09-19, updated same day once the user clarified N=New employee,
// U=Urgent/emergency advance) — distinct labels per code now, not reused
// group labels.
export const REQUEST_DOCUMENT_CODE_LABELS: Record<RequestDocumentCode, string> = {
  ADVANCE: "เงินเบิกล่วงหน้า",
  ADVANCEN: "เงินเบิกล่วงหน้าพนักงานใหม่",
  ADVANCEU: "เงินเบิกล่วงหน้าฉุกเฉิน",
  LOAN: "เงินกู้",
  TRAINING: "ค่าอบรม",
};
