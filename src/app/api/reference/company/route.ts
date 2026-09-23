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

  const companies = await prisma.refCompany.findMany({ orderBy: { CompanyCode: "asc" } });
  return apiSuccess(companies);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "save");
  if (denied) return denied;

  let body: {
    companyCode?: unknown;
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

  const companyCode = typeof body.companyCode === "string" ? body.companyCode.trim() : "";
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  if (!companyCode || !companyName) return apiError(400, "INVALID_PARAMS", "companyCode and companyName are required");

  const existing = await prisma.refCompany.findUnique({ where: { CompanyCode: companyCode } });
  if (existing) return apiError(409, "COMPANY_ALREADY_EXISTS", undefined, { companyCode });

  let registeredDate: Date | null = null;
  if (typeof body.registeredDate === "string" && body.registeredDate) {
    const d = new Date(body.registeredDate);
    if (Number.isNaN(d.getTime())) return apiError(400, "VALIDATION_FAILED", "registeredDate is invalid");
    registeredDate = d;
  }

  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const created = await prisma.refCompany.create({
    data: {
      CompanyCode: companyCode,
      CompanyName: companyName,
      ShortName: s(body.shortName),
      Address: s(body.address),
      TaxID: s(body.taxID),
      SSORegistNo: s(body.ssoRegistNo),
      ContactPhone: s(body.contactPhone),
      SecurityBusinessLicenseNo: s(body.securityBusinessLicenseNo),
      AuthorizedSignerName: s(body.authorizedSignerName),
      AuthorizedSignerPosition: s(body.authorizedSignerPosition),
      RegisteredDate: registeredDate,
      RegisteredProvince: s(body.registeredProvince),
      AddressHouseNo: s(body.addressHouseNo),
      AddressFloor: s(body.addressFloor),
      AddressMoo: s(body.addressMoo),
      AddressSoi: s(body.addressSoi),
      AddressRoad: s(body.addressRoad),
      AddressTambon: s(body.addressTambon),
      AddressAmphoe: s(body.addressAmphoe),
      AddressProvince: s(body.addressProvince),
      AddressZipCode: s(body.addressZipCode),
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "CREATE_COMPANY", { targetTable: "ref_company", targetId: companyCode });
  return apiSuccess(created, 201);
}
