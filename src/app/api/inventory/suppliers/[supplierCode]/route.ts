import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/inventory/suppliers/[supplierCode]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SUPPLIER", "read");
  if (denied) return denied;

  const { supplierCode } = await ctx.params;
  const supplier = await prisma.invSupplier.findUnique({ where: { SupplierCode: supplierCode } });
  if (!supplier) return apiError(404, "SUPPLIER_NOT_FOUND");
  return apiSuccess(supplier);
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/inventory/suppliers/[supplierCode]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SUPPLIER", "save");
  if (denied) return denied;

  const { supplierCode } = await ctx.params;
  const existing = await prisma.invSupplier.findUnique({ where: { SupplierCode: supplierCode } });
  if (!existing) return apiError(404, "SUPPLIER_NOT_FOUND");

  let body: { supplierName?: unknown; address?: unknown; contactPhone?: unknown; isActive?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const supplierName = typeof body.supplierName === "string" ? body.supplierName.trim() : "";
  if (!supplierName) return apiError(400, "INVALID_PARAMS", "supplierName is required");

  const updated = await prisma.invSupplier.update({
    where: { SupplierCode: supplierCode },
    data: {
      SupplierName: supplierName,
      Address: typeof body.address === "string" && body.address.trim() ? body.address.trim() : null,
      ContactPhone: typeof body.contactPhone === "string" && body.contactPhone.trim() ? body.contactPhone.trim() : null,
      IsActive: typeof body.isActive === "boolean" ? body.isActive : existing.IsActive,
    },
  });

  await logAction(user.userId, "UPDATE_SUPPLIER", { targetTable: "inv_supplier", targetId: supplierCode });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/inventory/suppliers/[supplierCode]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SUPPLIER", "delete");
  if (denied) return denied;

  const { supplierCode } = await ctx.params;
  const existing = await prisma.invSupplier.findUnique({ where: { SupplierCode: supplierCode } });
  if (!existing) return apiError(404, "SUPPLIER_NOT_FOUND");

  const updated = await prisma.invSupplier.update({ where: { SupplierCode: supplierCode }, data: { IsActive: false } });
  await logAction(user.userId, "DEACTIVATE_SUPPLIER", { targetTable: "inv_supplier", targetId: supplierCode });
  return apiSuccess(updated);
}
