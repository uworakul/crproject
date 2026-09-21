import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/reference/deduction-types/[code]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "INCOME_DEDUCTION", "save");
  if (denied) return denied;

  const { code } = await ctx.params;
  const existing = await prisma.refDeductionType.findUnique({ where: { DeductionCode: code } });
  if (!existing) return apiError(404, "DEDUCTION_TYPE_NOT_FOUND");

  let body: { deductionName?: unknown; isInstallment?: unknown; isAutoCalculated?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const updated = await prisma.refDeductionType.update({
    where: { DeductionCode: code },
    data: {
      DeductionName: typeof body.deductionName === "string" ? body.deductionName.trim() : undefined,
      IsInstallment: typeof body.isInstallment === "boolean" ? body.isInstallment : undefined,
      IsAutoCalculated: typeof body.isAutoCalculated === "boolean" ? body.isAutoCalculated : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_DEDUCTION_TYPE", { targetTable: "ref_deduction_type", targetId: code });
  return apiSuccess(updated);
}

// Hard delete — no other table references ref_deduction_type yet, but keep
// the same FK-safe pattern as the other reference tables for consistency.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/reference/deduction-types/[code]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "INCOME_DEDUCTION", "delete");
  if (denied) return denied;

  const { code } = await ctx.params;
  const existing = await prisma.refDeductionType.findUnique({ where: { DeductionCode: code } });
  if (!existing) return apiError(404, "DEDUCTION_TYPE_NOT_FOUND");

  try {
    await prisma.refDeductionType.delete({ where: { DeductionCode: code } });
  } catch {
    return apiError(409, "DEDUCTION_TYPE_IN_USE", "This deduction type is in use and cannot be deleted");
  }

  await logAction(user.userId, "DELETE_DEDUCTION_TYPE", { targetTable: "ref_deduction_type", targetId: code });
  return apiSuccess({ ok: true });
}
