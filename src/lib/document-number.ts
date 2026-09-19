import { toBuddhistYear } from "@/lib/buddhist-year";
import { prisma } from "@/lib/prisma";

// Without the year-month prefix it's a plain 5-digit running number
// ("00001"). With UseYearMonthPrefix it's fixed at 7 characters total:
// "YYMM" (2-digit พ.ศ. year + 2-digit month) + a 3-digit running number,
// e.g. "6909" + "042" = "6909042".
function formatSequenceNumber(n: number, useYearMonthPrefix: boolean): string {
  if (!useYearMonthPrefix) return String(n).padStart(5, "0");

  const now = new Date();
  const buddhistYY = String(toBuddhistYear(now.getFullYear())).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${buddhistYY}${mm}${String(n).padStart(3, "0")}`;
}

// NextNumber is display-only (not stored) — just LatestNumber + 1 formatted.
// Used for the reference table's preview column.
export function computeNextNumber(latestNumber: number, useYearMonthPrefix: boolean): string {
  return formatSequenceNumber(latestNumber + 1, useYearMonthPrefix);
}

export function withNextNumber<T extends { LatestNumber: number; UseYearMonthPrefix: boolean }>(row: T) {
  return { ...row, NextNumber: computeNextNumber(row.LatestNumber, row.UseYearMonthPrefix) };
}

// Auto-provisions a ref_document_number row the first time it's needed,
// instead of requiring an admin to set it up via /reference first
// (LatestNumber=0, UseYearMonthPrefix=false, IsCustomNumber=false).
export async function getOrCreateDocumentNumber(documentCode: string, description: string) {
  const existing = await prisma.refDocumentNumber.findUnique({ where: { DocumentCode: documentCode } });
  if (existing) return existing;
  return prisma.refDocumentNumber.create({ data: { DocumentCode: documentCode, Description: description } });
}

// Actually wired into a real generator (2026-09-19) — used by the "Add
// Employee" page (DocumentCode "NEW_EMPNO") to suggest, and re-generate on
// collision, an EmpCode. Scans forward from LatestNumber+1 until it finds a
// code not already in mst_employee (self-healing: doesn't assume
// LatestNumber is perfectly in sync with reality, e.g. after someone
// manually created an employee out of sequence). Returns null only if the
// row is marked "กำหนดเอง" (IsCustomNumber) — that's a deliberate opt-out
// with no sequence to generate from, so callers must fall back to their own
// behavior then (e.g. leaving the field blank, or the original
// hard-block-on-duplicate error).
export async function findNextFreeEmployeeCode(documentCode: string): Promise<{ code: string; consumedLatestNumber: number } | null> {
  const docNum = await getOrCreateDocumentNumber(documentCode, "รหัสพนักงานใหม่");
  if (docNum.IsCustomNumber) return null;

  const MAX_ATTEMPTS = 10000;
  let n = docNum.LatestNumber;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    n += 1;
    const code = formatSequenceNumber(n, docNum.UseYearMonthPrefix);
    const existing = await prisma.mstEmployee.findUnique({ where: { EmpCode: code } });
    if (!existing) return { code, consumedLatestNumber: n };
  }
  return null;
}

// Simpler sibling of findNextFreeEmployeeCode for documents that don't need
// collision-scanning against another table (2026-09-19, ใบขออนุมัติ
// เบิก/กู้/อบรม) — just atomically advances LatestNumber and formats it.
// Returns null if the DocumentCode is marked "กำหนดเอง" (no sequence to
// generate from); callers should leave DocumentNo blank in that case.
export async function consumeDocumentNumber(documentCode: string, description: string): Promise<string | null> {
  const docNum = await getOrCreateDocumentNumber(documentCode, description);
  if (docNum.IsCustomNumber) return null;

  const next = docNum.LatestNumber + 1;
  const code = formatSequenceNumber(next, docNum.UseYearMonthPrefix);
  await prisma.refDocumentNumber.update({ where: { DocumentNumberID: docNum.DocumentNumberID }, data: { LatestNumber: next } });
  return code;
}
