import "server-only";
import ExcelJS from "exceljs";

// Shared helpers for the simple 2-column (code + name) reference tables
// that support Excel export/import (ref_department, ref_position). Kept
// server-only — parsing untrusted uploaded files never needs to happen in
// the browser bundle.

export async function buildTwoColumnWorkbook(sheetName: string, codeLabel: string, nameLabel: string, rows: { code: string; name: string }[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = [
    { header: codeLabel, key: "code", width: 20 },
    { header: nameLabel, key: "name", width: 40 },
  ];
  sheet.addRows(rows);
  return workbook.xlsx.writeBuffer();
}

export interface ParsedImportRow {
  code: string;
  name: string;
}

// Reads the first two columns of the first worksheet, skipping the header
// row. Column order (code, name) is what matters, not the exact header
// text — keeps this robust against minor label differences in re-exported
// or hand-edited files.
export async function parseTwoColumnWorkbook(buffer: Buffer): Promise<ParsedImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: ParsedImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const code = String(row.getCell(1).value ?? "").trim();
    const name = String(row.getCell(2).value ?? "").trim();
    if (!code || !name) return;
    rows.push({ code, name });
  });
  return rows;
}

// Same idea but for tables with one extra boolean column (e.g. ref_deduction_type.IsInstallment)
// — kept as a separate pair of functions rather than generalizing
// buildTwoColumnWorkbook/parseTwoColumnWorkbook, since only one table needs
// this shape right now and the 2-column functions are already relied on
// (and tested) by departments/positions/sites/income-types.
export async function buildThreeColumnWorkbook(
  sheetName: string,
  codeLabel: string,
  nameLabel: string,
  flagLabel: string,
  rows: { code: string; name: string; flag: boolean }[],
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = [
    { header: codeLabel, key: "code", width: 20 },
    { header: nameLabel, key: "name", width: 40 },
    { header: flagLabel, key: "flag", width: 15 },
  ];
  sheet.addRows(rows.map((r) => ({ code: r.code, name: r.name, flag: r.flag ? "Yes" : "No" })));
  return workbook.xlsx.writeBuffer();
}

export interface ParsedImportRowWithFlag {
  code: string;
  name: string;
  flag: boolean;
}

// Column position matters (A=code, B=name, C=flag), not exact header text —
// same robustness rationale as parseTwoColumnWorkbook. Flag column accepts
// "Yes"/"Y"/"TRUE"/"1" (case-insensitive) as true, anything else as false.
export async function parseThreeColumnWorkbook(buffer: Buffer): Promise<ParsedImportRowWithFlag[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: ParsedImportRowWithFlag[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const code = String(row.getCell(1).value ?? "").trim();
    const name = String(row.getCell(2).value ?? "").trim();
    if (!code || !name) return;
    const flagRaw = String(row.getCell(3).value ?? "")
      .trim()
      .toLowerCase();
    const flag = flagRaw === "yes" || flagRaw === "y" || flagRaw === "true" || flagRaw === "1";
    rows.push({ code, name, flag });
  });
  return rows;
}
