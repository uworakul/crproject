import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/reference/sso-base/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const ssoBaseId = Number(id);
  if (!Number.isInteger(ssoBaseId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.refSsoBase.findUnique({ where: { SSOBaseID: ssoBaseId } });
  if (!existing) return apiError(404, "SSO_BASE_NOT_FOUND");

  let body: { effectiveYear?: unknown; effectiveDate?: unknown; minBase?: unknown; maxBase?: unknown; employeeRate?: unknown; employerRate?: unknown };
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

  const updated = await prisma.refSsoBase.update({
    where: { SSOBaseID: ssoBaseId },
    data: {
      EffectiveYear: body.effectiveYear !== undefined ? Number(body.effectiveYear) : undefined,
      EffectiveDate: effectiveDate,
      MinBase: body.minBase !== undefined ? Number(body.minBase) : undefined,
      MaxBase: body.maxBase !== undefined ? Number(body.maxBase) : undefined,
      EmployeeRate: body.employeeRate !== undefined ? Number(body.employeeRate) : undefined,
      EmployerRate: body.employerRate !== undefined ? Number(body.employerRate) : undefined,
    },
  });

  await logAction(user.userId, "UPDATE_SSO_BASE", { targetTable: "ref_sso_base", targetId: id });
  return apiSuccess(updated);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/reference/sso-base/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  const ssoBaseId = Number(id);
  if (!Number.isInteger(ssoBaseId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.refSsoBase.findUnique({ where: { SSOBaseID: ssoBaseId } });
  if (!existing) return apiError(404, "SSO_BASE_NOT_FOUND");

  await prisma.refSsoBase.delete({ where: { SSOBaseID: ssoBaseId } });
  await logAction(user.userId, "DELETE_SSO_BASE", { targetTable: "ref_sso_base", targetId: id });
  return apiSuccess({ ok: true });
}
