import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/reference/company/[code]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "save");
  if (denied) return denied;

  const { code } = await ctx.params;
  const existing = await prisma.refCompany.findUnique({ where: { CompanyCode: code } });
  if (!existing) return apiError(404, "COMPANY_NOT_FOUND");

  let body: { companyName?: unknown; address?: unknown; taxID?: unknown; ssoRegistNo?: unknown; contactPhone?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const updated = await prisma.refCompany.update({
    where: { CompanyCode: code },
    data: {
      CompanyName: typeof body.companyName === "string" && body.companyName.trim() ? body.companyName.trim() : undefined,
      Address: typeof body.address === "string" ? (body.address.trim() || null) : undefined,
      TaxID: typeof body.taxID === "string" ? (body.taxID.trim() || null) : undefined,
      SSORegistNo: typeof body.ssoRegistNo === "string" ? (body.ssoRegistNo.trim() || null) : undefined,
      ContactPhone: typeof body.contactPhone === "string" ? (body.contactPhone.trim() || null) : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_COMPANY", { targetTable: "ref_company", targetId: code });
  return apiSuccess(updated);
}

// Hard delete — no IsActive column, and no other table has an FK to
// ref_company (standalone reference data).
export async function DELETE(_req: Request, ctx: RouteContext<"/api/reference/company/[code]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "delete");
  if (denied) return denied;

  const { code } = await ctx.params;
  const existing = await prisma.refCompany.findUnique({ where: { CompanyCode: code } });
  if (!existing) return apiError(404, "COMPANY_NOT_FOUND");

  await prisma.refCompany.delete({ where: { CompanyCode: code } });
  await logAction(user.userId, "DELETE_COMPANY", { targetTable: "ref_company", targetId: code });
  return apiSuccess({ ok: true });
}
