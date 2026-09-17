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

  let body: { companyCode?: unknown; companyName?: unknown; address?: unknown; taxID?: unknown; ssoRegistNo?: unknown; contactPhone?: unknown };
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

  const created = await prisma.refCompany.create({
    data: {
      CompanyCode: companyCode,
      CompanyName: companyName,
      Address: typeof body.address === "string" && body.address.trim() ? body.address.trim() : null,
      TaxID: typeof body.taxID === "string" && body.taxID.trim() ? body.taxID.trim() : null,
      SSORegistNo: typeof body.ssoRegistNo === "string" && body.ssoRegistNo.trim() ? body.ssoRegistNo.trim() : null,
      ContactPhone: typeof body.contactPhone === "string" && body.contactPhone.trim() ? body.contactPhone.trim() : null,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "CREATE_COMPANY", { targetTable: "ref_company", targetId: companyCode });
  return apiSuccess(created, 201);
}
