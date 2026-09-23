import "server-only";

// Shared Sort-by/Group-by + subtotal/grand-total engine (2026-09-23),
// scoped to the "flat table" reports only (bank remittance, the 4 debt
// reports, employee registry, and the 5 หน่วยงานภาครัฐ reports) — per the
// user's own decision when this was scoped: Payslip/employee card (per-
// person card layouts, not tables) and dept/site-summary (already grouped
// by definition) are excluded.
export type GroupByField = "" | "DEPT" | "SITE" | "BANK" | "EMPLOYEE_TYPE";
export type SortByField = "empCode" | "fullName";
export type SortDir = "asc" | "desc";

export const EMPLOYEE_TYPE_GROUP_LABELS: Record<string, string> = { DAILY: "รายวัน", MONTHLY: "รายเดือน" };

// Every row from an in-scope report carries these grouping dimensions —
// added to each report's own row shape alongside its report-specific
// fields. Optional/nullable because a report row's employee may not have
// dept/site/bank set.
export interface GroupableRow {
  empCode: string;
  fullName: string;
  deptCode: string | null;
  deptName: string | null;
  siteCode: string | null;
  siteName: string | null;
  bankCode: string | null;
  bankName: string | null;
  employeeType: string | null;
}

export function parseGroupBy(v: string | null): GroupByField {
  return v === "DEPT" || v === "SITE" || v === "BANK" || v === "EMPLOYEE_TYPE" ? v : "";
}
export function parseSortBy(v: string | null): SortByField {
  return v === "fullName" ? "fullName" : "empCode";
}
export function parseSortDir(v: string | null): SortDir {
  return v === "desc" ? "desc" : "asc";
}

function groupKeyOf(row: GroupableRow, groupBy: GroupByField): { code: string; label: string } | null {
  switch (groupBy) {
    case "DEPT":
      return { code: row.deptCode ?? "-", label: row.deptName ?? "(ไม่ระบุแผนก)" };
    case "SITE":
      return { code: row.siteCode ?? "-", label: row.siteName ?? "(ไม่ระบุหน่วยงาน)" };
    case "BANK":
      return { code: row.bankCode ?? "-", label: row.bankName ?? "(ไม่ระบุธนาคาร)" };
    case "EMPLOYEE_TYPE":
      return { code: row.employeeType ?? "-", label: EMPLOYEE_TYPE_GROUP_LABELS[row.employeeType ?? ""] ?? row.employeeType ?? "(ไม่ระบุ)" };
    default:
      return null;
  }
}

export function sortRows<T extends GroupableRow>(rows: T[], sortBy: SortByField, sortDir: SortDir): T[] {
  const sorted = [...rows].sort((a, b) => (sortBy === "fullName" ? a.fullName : a.empCode).localeCompare((sortBy === "fullName" ? b.fullName : b.empCode), "th"));
  return sortDir === "desc" ? sorted.reverse() : sorted;
}

// Sums a string-encoded numeric field (as every report row stores amounts —
// `Prisma.Decimal.toFixed(2)` strings) across a set of rows, treating null
// as 0. Shared by every grand-total/subtotal computation.
export function sumField<T>(rows: T[], get: (r: T) => string | null | undefined): number {
  return rows.reduce((s, r) => s + Number(get(r) ?? 0), 0);
}

export interface RowGroup<T> {
  label: string;
  rows: T[];
}

// null = no grouping (groupBy was ""); otherwise one bucket per distinct
// group value, in label order, each bucket's rows already in the order
// sortRows() gave them (grouping never re-sorts within a group).
export function groupRows<T extends GroupableRow>(rows: T[], groupBy: GroupByField): RowGroup<T>[] | null {
  if (!groupBy) return null;
  const groups = new Map<string, RowGroup<T>>();
  for (const row of rows) {
    const key = groupKeyOf(row, groupBy)!;
    const g = groups.get(key.code) ?? { label: key.label, rows: [] };
    g.rows.push(row);
    groups.set(key.code, g);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, "th"));
}

// Interleaves each group's data rows with a bold subtotal row (built by
// toSubtotalRow from that group's own rows), for a plain rows: (string |
// number)[][] table (PDF/Excel both consume this shape, just via different
// renderers). Returns the indices of the subtotal rows within the flat
// array so the caller can bold/shade them. ungrouped rows pass through
// untouched with no bold indices.
export function buildGroupedRows<T>(
  rows: T[],
  groups: RowGroup<T>[] | null,
  toRow: (r: T) => (string | number)[],
  toSubtotalRow: (groupLabel: string, rows: T[]) => (string | number)[],
): { rows: (string | number)[][]; boldRowIndices: number[] } {
  if (!groups) return { rows: rows.map(toRow), boldRowIndices: [] };
  const outRows: (string | number)[][] = [];
  const boldRowIndices: number[] = [];
  for (const g of groups) {
    for (const r of g.rows) outRows.push(toRow(r));
    outRows.push(toSubtotalRow(g.label, g.rows));
    boldRowIndices.push(outRows.length - 1);
  }
  return { rows: outRows, boldRowIndices };
}

// Same idea but for the Excel writer's Record<string, string | number>[]
// row shape.
export function buildGroupedExcelRows<T>(
  rows: T[],
  groups: RowGroup<T>[] | null,
  toRow: (r: T) => Record<string, string | number | null>,
  toSubtotalRow: (groupLabel: string, rows: T[]) => Record<string, string | number>,
): { rows: Record<string, string | number | null>[]; boldRowIndices: number[] } {
  if (!groups) return { rows: rows.map(toRow), boldRowIndices: [] };
  const outRows: Record<string, string | number | null>[] = [];
  const boldRowIndices: number[] = [];
  for (const g of groups) {
    for (const r of g.rows) outRows.push(toRow(r));
    outRows.push(toSubtotalRow(g.label, g.rows));
    boldRowIndices.push(outRows.length - 1);
  }
  return { rows: outRows, boldRowIndices };
}
