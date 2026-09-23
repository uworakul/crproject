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

// inv_product's shape only — code/name/categoryCode/unitCost/unitPrice.
// Kept separate rather than generalizing further, same rationale as the
// two/three-column pair: only one table needs this shape.
export interface ParsedProductRow {
  code: string;
  name: string;
  categoryCode: string | null;
  unitCost: number;
  unitPrice: number;
}

export async function buildProductWorkbook(
  rows: { code: string; name: string; categoryCode: string | null; unitCost: number; unitPrice: number }[],
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("สินค้า");
  sheet.columns = [
    { header: "รหัสสินค้า", key: "code", width: 20 },
    { header: "ชื่อสินค้า", key: "name", width: 40 },
    { header: "รหัสหมวดหมู่", key: "categoryCode", width: 20 },
    { header: "ต้นทุน/หน่วย", key: "unitCost", width: 15 },
    { header: "ราคาขาย/หน่วย", key: "unitPrice", width: 15 },
  ];
  sheet.addRows(rows.map((r) => ({ ...r, categoryCode: r.categoryCode ?? "" })));
  return workbook.xlsx.writeBuffer();
}

// Column position matters (A=code, B=name, C=categoryCode, D=unitCost,
// E=unitPrice), not exact header text. categoryCode is optional (blank
// cell -> null); unitCost/unitPrice default to 0 when blank or unparsable.
export async function parseProductWorkbook(buffer: Buffer): Promise<ParsedProductRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: ParsedProductRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const code = String(row.getCell(1).value ?? "").trim();
    const name = String(row.getCell(2).value ?? "").trim();
    if (!code || !name) return;
    const categoryCodeRaw = String(row.getCell(3).value ?? "").trim();
    const unitCost = Number(row.getCell(4).value ?? 0);
    const unitPrice = Number(row.getCell(5).value ?? 0);
    rows.push({
      code,
      name,
      categoryCode: categoryCodeRaw || null,
      unitCost: Number.isFinite(unitCost) ? unitCost : 0,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    });
  });
  return rows;
}

// Worksheet's shape: one row per employee, fixed info columns (code/name/
// type/position/rate/total) then one column per day of the month, mirroring
// the on-screen grid — kept separate from the 2/3-column pair above since
// the day-column count varies by month (28-31) and isn't a fixed shape.
export interface WorksheetExportRow {
  empCode: string;
  empName: string;
  empType: string; // "REGULAR" | "SPARE"
  positionName: string | null;
  dailyRate: number;
  days: (string | null)[]; // index 0 = day 1
  total: number;
}

export async function buildWorksheetWorkbook(daysInMonth: number, rows: WorksheetExportRow[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("ใบลงเวลา");
  sheet.columns = [
    { header: "รหัสพนักงาน", key: "empCode", width: 14 },
    { header: "ชื่อพนักงาน", key: "empName", width: 26 },
    { header: "ประเภท", key: "empType", width: 10 },
    { header: "ตำแหน่ง", key: "positionName", width: 18 },
    { header: "ค่าแรง/วัน", key: "dailyRate", width: 12 },
    ...Array.from({ length: daysInMonth }, (_, i) => ({ header: String(i + 1), key: `day${i + 1}`, width: 5 })),
    { header: "รวม", key: "total", width: 12 },
  ];
  for (const r of rows) {
    const rowData: Record<string, string | number> = {
      empCode: r.empCode,
      empName: r.empName,
      empType: r.empType === "REGULAR" ? "ประจำ" : "สแปร์",
      positionName: r.positionName ?? "",
      dailyRate: r.dailyRate,
      total: r.total,
    };
    r.days.forEach((code, i) => {
      rowData[`day${i + 1}`] = code ?? "";
    });
    sheet.addRow(rowData);
  }
  return workbook.xlsx.writeBuffer();
}

export interface ParsedWorksheetImportRow {
  empCode: string;
  days: Map<number, string | null>; // day number -> attendance code, or null to clear that cell
}

// Column A is always the employee code (position-based, same robustness
// rationale as the other parsers), but the day columns are located by
// HEADER text this time — "1".."daysInMonth" — since which columns those
// are shifts with the month, unlike the fixed 2/3-column tables. Columns
// with any other header (name/type/position/rate/total, or anything a user
// added) are ignored entirely, so re-importing an export round-trips
// cleanly regardless of what else is in the sheet. A day column present in
// the header but blank on a given row means "clear this cell"; a day column
// missing from the header entirely (e.g. a user deleted it) is left
// untouched rather than cleared.
export async function parseWorksheetWorkbook(buffer: Buffer, daysInMonth: number): Promise<ParsedWorksheetImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const dayColumns = new Map<number, number>(); // column index -> day number
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const n = Number(String(cell.value ?? "").trim());
    if (Number.isInteger(n) && n >= 1 && n <= daysInMonth) dayColumns.set(colNumber, n);
  });

  const rows: ParsedWorksheetImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const empCode = String(row.getCell(1).value ?? "").trim();
    if (!empCode) return;
    const days = new Map<number, string | null>();
    for (const [colIdx, dayNum] of dayColumns) {
      const raw = String(row.getCell(colIdx).value ?? "").trim();
      days.set(dayNum, raw === "" ? null : raw.toUpperCase());
    }
    rows.push({ empCode, days });
  });
  return rows;
}
