import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "read");
  if (denied) return denied;

  const banks = await prisma.refBank.findMany({ orderBy: { BankCode: "asc" } });
  return apiSuccess(banks);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "save");
  if (denied) return denied;

  let body: { bankCode?: unknown; bankNameTH?: unknown; bankNameEN?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const bankCode = typeof body.bankCode === "string" ? body.bankCode.trim() : "";
  const bankNameTH = typeof body.bankNameTH === "string" ? body.bankNameTH.trim() : "";
  // bankNameEN is NOT NULL in the DDL but the simplified UI (code + name
  // only) no longer collects it separately — default to the Thai name
  // rather than block creation; can still be set precisely later via a
  // direct edit if the English name genuinely differs.
  const bankNameEN = typeof body.bankNameEN === "string" && body.bankNameEN.trim() ? body.bankNameEN.trim() : bankNameTH;
  if (!bankCode || !bankNameTH) {
    return apiError(400, "INVALID_PARAMS", "bankCode and bankNameTH are required");
  }

  const existing = await prisma.refBank.findUnique({ where: { BankCode: bankCode } });
  if (existing) return apiError(409, "BANK_ALREADY_EXISTS", undefined, { bankCode });

  const created = await prisma.refBank.create({
    data: { BankCode: bankCode, BankNameTH: bankNameTH, BankNameEN: bankNameEN, CreatedBy: user.userId },
  });
  await logAction(user.userId, "CREATE_BANK", { targetTable: "ref_bank", targetId: bankCode });
  return apiSuccess(created, 201);
}
