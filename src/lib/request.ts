// No "server-only" guard — these constants are also used client-side (form dropdowns).

// Document codes shown in the "รหัสเอกสาร" dropdown (2026-09-19, replaces
// the old 1:1 RequestType model). ADVANCEN/ADVANCEU are separate advance
// categories split by purpose per the user's own request — all three still
// map to the same REQUEST_ADVANCE permission group and the same underlying
// business flow as plain ADVANCE, just with their own document-number
// sequence and label for tracking/printing.
//
// 2026-09-28 — 4 new document types added, each with its own permission
// group (see REQUEST_PERMISSION_GROUPS/REQUEST_DOCUMENT_DOCTYPE below) and
// its own shape (see REQUEST_DOCUMENT_KIND): COMMISSION/BONUS post an income
// line to the beneficiary's current payroll period on approval (instead of
// the debt-shaped ADVANCE/LOAN/TRAINING flow); PROMOTE/RESIGN don't use
// Amount/DeductPerPeriod at all — see trn_request_detail's
// OldPositionCode/NewPositionCode/OldIncome and
// ResignReason/RequestedResignDate/AddToBlacklist columns instead.
// (COMMISSION was named REFERRAL, and PROMOTE was named POSITION_CHANGE,
// until later the same day — both renamed at the user's request; see the
// data migration in git history for the real documents + document-number
// sequences that got renamed in place. The POSITION_CHANGE rename also
// fixed a real bug: "REQUEST_POSITION_CHANGE" is 24 chars, silently
// truncated by sys_menu.DocumentType's VARCHAR(20) to "REQUEST_POSITION_CHA"
// — granting that permission via the Users screen would have failed with an
// FK violation. "REQUEST_PROMOTE" (16 chars) fits.)
export const REQUEST_DOCUMENT_CODE_VALUES = ["ADVANCE", "ADVANCEN", "ADVANCEU", "LOAN", "TRAINING", "COMMISSION", "BONUS", "PROMOTE", "RESIGN"] as const;
export type RequestDocumentCode = (typeof REQUEST_DOCUMENT_CODE_VALUES)[number];

export function isValidRequestDocumentCode(value: unknown): value is RequestDocumentCode {
  return typeof value === "string" && (REQUEST_DOCUMENT_CODE_VALUES as readonly string[]).includes(value);
}

// What kind of thing a DocumentCode's rows actually are — drives both the
// UI (which fields show) and the approve endpoint (what approving does):
//   - "DEBT": creates an inv_employee_debt row per line (existing behavior)
//   - "INCOME": posts an INCOME line to the beneficiary's current payroll
//     period on approval (COMMISSION posts to the REFERRER, not the row's
//     own EmpCode — see approve/route.ts)
//   - "POSITION_CHANGE": approving updates mst_employee.PositionCode
//     (behavior-category name — kept distinct from the "PROMOTE" document
//     code that triggers it, same as "DEBT"/"INCOME" aren't named after any
//     one specific document code either)
//   - "RESIGN": approving sets EmployeeStatus=RESIGNED + ResignDate, and
//     adds a ref_black_list row if the line's AddToBlacklist is checked
export type RequestDocumentKind = "DEBT" | "INCOME" | "POSITION_CHANGE" | "RESIGN";
export const REQUEST_DOCUMENT_KIND: Record<RequestDocumentCode, RequestDocumentKind> = {
  ADVANCE: "DEBT",
  ADVANCEN: "DEBT",
  ADVANCEU: "DEBT",
  LOAN: "DEBT",
  TRAINING: "DEBT",
  COMMISSION: "INCOME",
  BONUS: "INCOME",
  PROMOTE: "POSITION_CHANGE",
  RESIGN: "RESIGN",
};

// DocumentCode -> which sys_menu/permission DocumentType governs it. The 3
// original codes stay folded into their existing 3-way split so already-
// granted permissions keep working exactly as before; the 4 new types each
// get their own DocumentType (see REQUEST_PERMISSION_GROUPS for why).
export const REQUEST_DOCUMENT_DOCTYPE: Record<RequestDocumentCode, string> = {
  ADVANCE: "REQUEST_ADVANCE",
  ADVANCEN: "REQUEST_ADVANCE",
  ADVANCEU: "REQUEST_ADVANCE",
  LOAN: "REQUEST_LOAN",
  TRAINING: "REQUEST_TRAINING",
  COMMISSION: "REQUEST_COMMISSION",
  BONUS: "REQUEST_BONUS",
  PROMOTE: "REQUEST_PROMOTE",
  RESIGN: "REQUEST_RESIGN",
};

// The permission groups themselves, for pages that need to enumerate them
// (list page tabs, draft-list visibility) — order matters for tab order.
export const REQUEST_PERMISSION_GROUPS = [
  { docType: "REQUEST_ADVANCE", label: "เบิกล่วงหน้า", documentCodes: ["ADVANCE", "ADVANCEN", "ADVANCEU"] as RequestDocumentCode[] },
  { docType: "REQUEST_LOAN", label: "เงินกู้", documentCodes: ["LOAN"] as RequestDocumentCode[] },
  { docType: "REQUEST_TRAINING", label: "ค่าอบรม", documentCodes: ["TRAINING"] as RequestDocumentCode[] },
  { docType: "REQUEST_COMMISSION", label: "ขอเบิกค่านำพา", documentCodes: ["COMMISSION"] as RequestDocumentCode[] },
  { docType: "REQUEST_BONUS", label: "โบนัส", documentCodes: ["BONUS"] as RequestDocumentCode[] },
  { docType: "REQUEST_PROMOTE", label: "ปรับตำแหน่ง", documentCodes: ["PROMOTE"] as RequestDocumentCode[] },
  { docType: "REQUEST_RESIGN", label: "แจ้งลาออก/ประกาศพ้นหน้าที่", documentCodes: ["RESIGN"] as RequestDocumentCode[] },
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
  COMMISSION: "ขอเบิกค่านำพา",
  BONUS: "โบนัส",
  PROMOTE: "ปรับตำแหน่ง",
  RESIGN: "แจ้งลาออก/ประกาศพ้นหน้าที่",
};

// Commission (ค่านำพา) eligibility (2026-09-28, confirmed with user):
// calendar days since StartDate, not Worksheet-attendance days (MONTHLY
// employees have no Worksheet at all).
export const COMMISSION_MIN_DAYS = 120;

// ref_income_type codes used when BONUS/COMMISSION requests get approved
// and post an income line to payroll (see approve/route.ts) — these are the
// company's own existing reference codes (prisma/seed.ts's incomeTypeSeed:
// "18"=โบนัส, "19"=ค่านำพา), the same ones HR could already pick manually in
// "รายการประจำงวด" before this feature existed. NOT the request DocumentCode
// itself — that's a separate code space (trn_request_header.DocumentCode).
export const REQUEST_INCOME_CODE: Partial<Record<RequestDocumentCode, string>> = {
  BONUS: "18",
  COMMISSION: "19",
};

// ref_deduction_type codes used when a DEBT-kind request gets approved and
// creates an inv_employee_debt row (see approve/route.ts). Until 2026-09-29
// approval wrote DeductionCode = the request's own DocumentCode string
// (ADVANCE/ADVANCEN/ADVANCEU/LOAN/TRAINING) directly, auto-provisioning a
// ref_deduction_type row for it if missing — but ref_deduction_type already
// had these exact 5 categories under the company's own legacy numeric codes
// (13/14/15/12/10, seeded from an early Excel import), so every approval
// kept re-creating a same-meaning duplicate row next to the numeric one
// ("เงินเบิกล่วงหน้า" appearing twice: once as "13", once as "ADVANCE"). Fixed
// by mapping to the existing numeric code instead of using DocumentCode
// as-is; the 13 real debt rows that had already accumulated under the text
// codes were migrated to the numeric ones in the same pass, and the
// now-unreferenced ADVANCE/ADVANCEN/ADVANCEU/LOAN/TRAINING rows were
// deleted from ref_deduction_type (see git history for the one-off
// migration script). UNIFORM/"08" has the identical duplication, fixed the
// same way, but isn't part of this map — that one's written directly by
// the Inventory Issue/Return approve routes, not through a Request.
export const REQUEST_DOCUMENT_DEDUCTION_CODE: Partial<Record<RequestDocumentCode, string>> = {
  ADVANCE: "13",
  ADVANCEN: "14",
  ADVANCEU: "15",
  LOAN: "12",
  TRAINING: "10",
};
