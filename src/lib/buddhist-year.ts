// Pure display-layer helpers for Buddhist Era (พ.ศ.) year conversion.
// All years are stored and compared internally as Gregorian (ค.ศ.) — this
// file only converts at the UI edge (display + form input), never touches
// stored data or business logic (sys_period.PeriodYear, ref_*.EffectiveYear,
// mst_employee_leave_balance.Year all remain Gregorian in the DB/API).
const BE_OFFSET = 543;

export function toBuddhistYear(gregorianYear: number): number {
  return gregorianYear + BE_OFFSET;
}

export function toGregorianYear(buddhistYear: number): number {
  return buddhistYear - BE_OFFSET;
}
