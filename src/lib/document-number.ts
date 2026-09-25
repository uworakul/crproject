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
//
// DocumentCode DOES have a DB-level unique constraint, unlike LatestNumber's
// race above — so two concurrent first-ever calls for the same brand-new
// documentCode can't both succeed, but the LOSING one would previously
// crash with an unhandled Prisma P2002 (unique violation) instead of just
// returning the row the winner created. Caught here and re-fetched instead.
export async function getOrCreateDocumentNumber(documentCode: string, description: string) {
  const existing = await prisma.refDocumentNumber.findUnique({ where: { DocumentCode: documentCode } });
  if (existing) return existing;

  try {
    return await createDocumentNumberRow(documentCode, description);
  } catch (err) {
    // Duck-typed check, not `instanceof Prisma.PrismaClientKnownRequestError`
    // — that instanceof check is unreliable here: Turbopack compiles each
    // Route Handler/lib module as its own bundle, and an imported `Prisma`
    // namespace can end up a DIFFERENT module instance than the one the
    // actual error was thrown from (confirmed — the same class of bug
    // already hit AsyncLocalStorage singletons; see CLAUDE.md's
    // "Multi-tenant" entry). A plain `.code` string check isn't affected.
    const isCollision = typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
    if (isCollision) {
      const winner = await prisma.refDocumentNumber.findUnique({ where: { DocumentCode: documentCode } });
      if (winner) return winner;
    }
    throw err;
  }
}

async function createDocumentNumberRow(documentCode: string, description: string) {
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
//
// 2026-09-24 concurrency fix: this used to read LatestNumber, compute
// next = LatestNumber+1 in JS, then write that literal value back — two
// concurrent calls could both read the same LatestNumber before either
// wrote, both compute the same "next", and both succeed (DocumentNo has no
// DB-level unique constraint on any of the 8 tables that use this, so
// nothing catches it) — confirmed via a live 10-concurrent-request test
// (LOCK-001), which produced the SAME DocumentNo on all 10 documents every
// time. Fixed by using Prisma's atomic increment ({ increment: 1 }, which
// SQL Server executes as a single `SET LatestNumber = LatestNumber + 1`
// under that row's own lock) and reading the post-increment value back from
// the same statement's result, instead of computing it in JS beforehand.
export async function consumeDocumentNumber(documentCode: string, description: string): Promise<string | null> {
  const docNum = await getOrCreateDocumentNumber(documentCode, description);
  if (docNum.IsCustomNumber) return null;

  const updated = await prisma.refDocumentNumber.update({
    where: { DocumentNumberID: docNum.DocumentNumberID },
    data: { LatestNumber: { increment: 1 } },
  });
  return formatSequenceNumber(updated.LatestNumber, docNum.UseYearMonthPrefix);
}
