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

  let body: {
    companyName?: unknown;
    shortName?: unknown;
    address?: unknown;
    taxID?: unknown;
    ssoRegistNo?: unknown;
    contactPhone?: unknown;
    securityBusinessLicenseNo?: unknown;
    authorizedSignerName?: unknown;
    authorizedSignerPosition?: unknown;
    registeredDate?: unknown;
    registeredProvince?: unknown;
    addressHouseNo?: unknown;
    addressFloor?: unknown;
    addressMoo?: unknown;
    addressSoi?: unknown;
    addressRoad?: unknown;
    addressTambon?: unknown;
    addressAmphoe?: unknown;
    addressProvince?: unknown;
    addressZipCode?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  let registeredDate: Date | null | undefined;
  if (body.registeredDate === null || body.registeredDate === "") {
    registeredDate = null;
  } else if (typeof body.registeredDate === "string") {
    const d = new Date(body.registeredDate);
    if (Number.isNaN(d.getTime())) return apiError(400, "VALIDATION_FAILED", "registeredDate is invalid");
    registeredDate = d;
  }

  const os = (v: unknown) => (v === null ? null : typeof v === "string" ? v.trim() || null : undefined);
  const updated = await prisma.refCompany.update({
    where: { CompanyCode: code },
    data: {
      CompanyName: typeof body.companyName === "string" && body.companyName.trim() ? body.companyName.trim() : undefined,
      ShortName: os(body.shortName),
      Address: os(body.address),
      TaxID: os(body.taxID),
      SSORegistNo: os(body.ssoRegistNo),
      ContactPhone: os(body.contactPhone),
      SecurityBusinessLicenseNo: os(body.securityBusinessLicenseNo),
      AuthorizedSignerName: os(body.authorizedSignerName),
      AuthorizedSignerPosition: os(body.authorizedSignerPosition),
      RegisteredDate: registeredDate,
      RegisteredProvince: os(body.registeredProvince),
      AddressHouseNo: os(body.addressHouseNo),
      AddressFloor: os(body.addressFloor),
      AddressMoo: os(body.addressMoo),
      AddressSoi: os(body.addressSoi),
      AddressRoad: os(body.addressRoad),
      AddressTambon: os(body.addressTambon),
      AddressAmphoe: os(body.addressAmphoe),
      AddressProvince: os(body.addressProvince),
      AddressZipCode: os(body.addressZipCode),
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
