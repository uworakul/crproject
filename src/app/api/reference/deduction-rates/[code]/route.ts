import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/reference/deduction-rates/[code]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "TAX_RATE", "save");
  if (denied) return denied;

  const { code } = await ctx.params;
  const existing = await prisma.refDeductionRate.findUnique({ where: { DeductionCode: code } });
  if (!existing) return apiError(404, "DEDUCTION_RATE_NOT_FOUND");

  let body: { deductionName?: unknown; maxAmount?: unknown; effectiveYear?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const updated = await prisma.refDeductionRate.update({
    where: { DeductionCode: code },
    data: {
      DeductionName: typeof body.deductionName === "string" ? body.deductionName.trim() : undefined,
      MaxAmount: body.maxAmount !== undefined ? Number(body.maxAmount) : undefined,
      EffectiveYear: body.effectiveYear !== undefined ? Number(body.effectiveYear) : undefined,
    },
  });

  await logAction(user.userId, "UPDATE_DEDUCTION_RATE", { targetTable: "ref_deduction_rate", targetId: code });
  return apiSuccess(updated);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/reference/deduction-rates/[code]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "TAX_RATE", "delete");
  if (denied) return denied;

  const { code } = await ctx.params;
  const existing = await prisma.refDeductionRate.findUnique({ where: { DeductionCode: code } });
  if (!existing) return apiError(404, "DEDUCTION_RATE_NOT_FOUND");

  await prisma.refDeductionRate.delete({ where: { DeductionCode: code } });
  await logAction(user.userId, "DELETE_DEDUCTION_RATE", { targetTable: "ref_deduction_rate", targetId: code });
  return apiSuccess({ ok: true });
}
