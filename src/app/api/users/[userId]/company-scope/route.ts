import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// "บริษัทที่ใช้งานได้" checklist (2026-09-28 permission redesign) — a
// GLOBAL per-user filter (not per-DocumentType like sys_user_permission's
// SiteCode), enforced on real mst_employee-touching queries app-wide (see
// src/lib/employee-scope.ts). Zero rows = unrestricted (sees every
// company) — same convention as SiteCode=NULL elsewhere, so an account
// with nothing set here keeps working unchanged.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/users/[userId]/company-scope">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "USER", "read");
  if (denied) return denied;

  const { userId } = await ctx.params;
  const rows = await prisma.sysUserCompany.findMany({ where: { UserID: userId }, select: { CompanyCode: true }, orderBy: { CompanyCode: "asc" } });
  return apiSuccess(rows.map((r) => r.CompanyCode));
}

// Replaces the user's entire company checklist (full-replace, same
// convention as PUT .../permissions — the UI sends the whole checked set
// on every save).
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/users/[userId]/company-scope">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "USER", "save");
  if (denied) return denied;

  const { userId } = await ctx.params;
  const target = await prisma.sysUser.findUnique({ where: { UserID: userId } });
  if (!target) return apiError(404, "USER_NOT_FOUND");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }
  if (!Array.isArray(body) || !body.every((v) => typeof v === "string")) {
    return apiError(400, "INVALID_PARAMS", "Request body must be an array of CompanyCode strings");
  }
  const companyCodes = [...new Set(body as string[])];

  if (companyCodes.length > 0) {
    const validCodes = new Set((await prisma.refCompany.findMany({ where: { CompanyCode: { in: companyCodes } }, select: { CompanyCode: true } })).map((c) => c.CompanyCode));
    const invalid = companyCodes.filter((c) => !validCodes.has(c));
    if (invalid.length > 0) return apiError(400, "VALIDATION_FAILED", "Unknown CompanyCode", { invalid });
  }

  await prisma.$transaction([
    prisma.sysUserCompany.deleteMany({ where: { UserID: userId } }),
    ...(companyCodes.length > 0
      ? [prisma.sysUserCompany.createMany({ data: companyCodes.map((c) => ({ UserID: userId, CompanyCode: c, CreatedBy: user.userId })) })]
      : []),
  ]);

  await logAction(user.userId, "UPDATE_USER_COMPANY_SCOPE", { targetTable: "sys_user_company", targetId: userId });
  return apiSuccess({ ok: true, count: companyCodes.length });
}
