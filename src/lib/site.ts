// mst_site_position_income.RateBasis — how the Amount for one income line
// at one (Site, Position) is quoted. No "server-only" guard, same as
// src/lib/leave.ts — this is also useful client-side for the dropdown.
export const RATE_BASIS_VALUES = ["DAILY", "MONTHLY"] as const;
export type RateBasis = (typeof RATE_BASIS_VALUES)[number];
export const RATE_BASIS_LABELS: Record<RateBasis, string> = {
  DAILY: "ต่อวัน",
  MONTHLY: "ต่อเดือน",
};
export function isValidRateBasis(value: unknown): value is RateBasis {
  return typeof value === "string" && (RATE_BASIS_VALUES as readonly string[]).includes(value);
}
