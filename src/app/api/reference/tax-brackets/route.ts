import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "TAX_RATE", "read");
  if (denied) return denied;

  const rows = await prisma.refTaxBracket.findMany({ orderBy: [{ EffectiveYear: "desc" }, { IncomeFrom: "asc" }] });
  return apiSuccess(rows);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "TAX_RATE", "save");
  if (denied) return denied;

  let body: { effectiveYear?: unknown; incomeFrom?: unknown; incomeTo?: unknown; taxRate?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const effectiveYear = Number(body.effectiveYear);
  const incomeFrom = Number(body.incomeFrom);
  const incomeTo = Number(body.incomeTo);
  const taxRate = Number(body.taxRate);

  if (![effectiveYear, incomeFrom, incomeTo, taxRate].every(Number.isFinite)) {
    return apiError(400, "INVALID_PARAMS", "effectiveYear, incomeFrom, incomeTo, and taxRate are required");
  }
  if (incomeTo <= incomeFrom) return apiError(400, "VALIDATION_FAILED", "incomeTo must be greater than incomeFrom");
  if (taxRate < 0 || taxRate > 1) return apiError(400, "VALIDATION_FAILED", "taxRate must be between 0 and 1");

  const created = await prisma.refTaxBracket.create({
    data: { EffectiveYear: effectiveYear, IncomeFrom: incomeFrom, IncomeTo: incomeTo, TaxRate: taxRate, CreatedBy: user.userId },
  });
  await logAction(user.userId, "CREATE_TAX_BRACKET", { targetTable: "ref_tax_bracket", targetId: String(created.BracketID) });
  return apiSuccess(created, 201);
}
