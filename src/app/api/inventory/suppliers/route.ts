import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SUPPLIER", "read");
  if (denied) return denied;

  const suppliers = await prisma.invSupplier.findMany({ orderBy: { SupplierCode: "asc" } });
  return apiSuccess(suppliers);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SUPPLIER", "save");
  if (denied) return denied;

  let body: { supplierCode?: unknown; supplierName?: unknown; address?: unknown; contactPhone?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const supplierCode = typeof body.supplierCode === "string" ? body.supplierCode.trim() : "";
  const supplierName = typeof body.supplierName === "string" ? body.supplierName.trim() : "";
  if (!supplierCode || !supplierName) return apiError(400, "INVALID_PARAMS", "supplierCode and supplierName are required");

  const existing = await prisma.invSupplier.findUnique({ where: { SupplierCode: supplierCode } });
  if (existing) return apiError(409, "SUPPLIER_ALREADY_EXISTS", undefined, { supplierCode });

  const created = await prisma.invSupplier.create({
    data: {
      SupplierCode: supplierCode,
      SupplierName: supplierName,
      Address: typeof body.address === "string" && body.address.trim() ? body.address.trim() : null,
      ContactPhone: typeof body.contactPhone === "string" && body.contactPhone.trim() ? body.contactPhone.trim() : null,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "CREATE_SUPPLIER", { targetTable: "inv_supplier", targetId: supplierCode });
  return apiSuccess(created, 201);
}
