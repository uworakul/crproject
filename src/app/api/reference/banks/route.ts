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
  const bankNameEN = typeof body.bankNameEN === "string" ? body.bankNameEN.trim() : "";
  if (!bankCode || !bankNameTH || !bankNameEN) {
    return apiError(400, "INVALID_PARAMS", "bankCode, bankNameTH, and bankNameEN are required");
  }

  const existing = await prisma.refBank.findUnique({ where: { BankCode: bankCode } });
  if (existing) return apiError(409, "BANK_ALREADY_EXISTS", undefined, { bankCode });

  const created = await prisma.refBank.create({ data: { BankCode: bankCode, BankNameTH: bankNameTH, BankNameEN: bankNameEN } });
  await logAction(user.userId, "CREATE_BANK", { targetTable: "ref_bank", targetId: bankCode });
  return apiSuccess(created, 201);
}
