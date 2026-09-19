import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/reference/welfare-fund/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "TAX_RATE", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const welfareFundId = Number(id);
  if (!Number.isInteger(welfareFundId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.refWelfareFund.findUnique({ where: { WelfareFundID: welfareFundId } });
  if (!existing) return apiError(404, "WELFARE_FUND_NOT_FOUND");

  let body: { effectiveYear?: unknown; effectiveDate?: unknown; employeeRate?: unknown; employerRate?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  let effectiveDate: Date | null | undefined;
  if (body.effectiveDate === null) {
    effectiveDate = null;
  } else if (typeof body.effectiveDate === "string" && body.effectiveDate) {
    effectiveDate = new Date(body.effectiveDate);
    if (Number.isNaN(effectiveDate.getTime())) return apiError(400, "VALIDATION_FAILED", "effectiveDate is invalid");
  }

  const updated = await prisma.refWelfareFund.update({
    where: { WelfareFundID: welfareFundId },
    data: {
      EffectiveYear: body.effectiveYear !== undefined ? Number(body.effectiveYear) : undefined,
      EffectiveDate: effectiveDate,
      EmployeeRate: body.employeeRate !== undefined ? Number(body.employeeRate) : undefined,
      EmployerRate: body.employerRate !== undefined ? Number(body.employerRate) : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_WELFARE_FUND", { targetTable: "ref_welfare_fund", targetId: id });
  return apiSuccess(updated);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/reference/welfare-fund/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "TAX_RATE", "delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  const welfareFundId = Number(id);
  if (!Number.isInteger(welfareFundId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.refWelfareFund.findUnique({ where: { WelfareFundID: welfareFundId } });
  if (!existing) return apiError(404, "WELFARE_FUND_NOT_FOUND");

  await prisma.refWelfareFund.delete({ where: { WelfareFundID: welfareFundId } });
  await logAction(user.userId, "DELETE_WELFARE_FUND", { targetTable: "ref_welfare_fund", targetId: id });
  return apiSuccess({ ok: true });
}
