import "server-only";
import ExcelJS from "exceljs";

export interface ReportExcelColumn {
  header: string;
  key: string;
  width?: number;
}

// One generic builder shared by every /payroll/reports report's Excel
// export — unlike the fixed-shape reference-table builders in
// excel-reference.ts, these reports all have a genuinely dynamic column set
// (dept/site summary's income/deduction columns vary by what's in the
// data), so there's no fixed 2/3-column shape to specialize for the way
// that file does.
// boldRowIndices: indices into `rows` (0-based, before the header/totalRow
// are added) to bold — used for per-group subtotal rows when a report is
// grouped (see src/lib/reports/group-sort.ts). The grand totalRow is always
// bold regardless, same as before.
export async function buildReportWorkbook(
  sheetName: string,
  columns: ReportExcelColumn[],
  rows: Record<string, string | number | null>[],
  totalRow?: Record<string, string | number>,
  boldRowIndices?: number[],
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16 }));
  sheet.addRows(rows);
  const boldSet = new Set(boldRowIndices ?? []);
  for (const i of boldSet) {
    sheet.getRow(i + 2).font = { bold: true }; // +1 for the header row, +1 because ExcelJS rows are 1-indexed
  }
  if (totalRow) {
    const row = sheet.addRow(totalRow);
    row.font = { bold: true };
  }
  sheet.getRow(1).font = { bold: true };
  return workbook.xlsx.writeBuffer();
}
