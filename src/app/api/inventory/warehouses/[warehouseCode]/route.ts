import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/inventory/warehouses/[warehouseCode]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "WAREHOUSE", "read");
  if (denied) return denied;

  const { warehouseCode } = await ctx.params;
  const warehouse = await prisma.invWarehouse.findUnique({ where: { WarehouseCode: warehouseCode } });
  if (!warehouse) return apiError(404, "WAREHOUSE_NOT_FOUND");
  return apiSuccess(warehouse);
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/inventory/warehouses/[warehouseCode]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "WAREHOUSE", "save");
  if (denied) return denied;

  const { warehouseCode } = await ctx.params;
  const existing = await prisma.invWarehouse.findUnique({ where: { WarehouseCode: warehouseCode } });
  if (!existing) return apiError(404, "WAREHOUSE_NOT_FOUND");

  let body: { warehouseName?: unknown; isActive?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const warehouseName = typeof body.warehouseName === "string" ? body.warehouseName.trim() : "";
  if (!warehouseName) return apiError(400, "INVALID_PARAMS", "warehouseName is required");

  const updated = await prisma.invWarehouse.update({
    where: { WarehouseCode: warehouseCode },
    data: {
      WarehouseName: warehouseName,
      IsActive: typeof body.isActive === "boolean" ? body.isActive : existing.IsActive,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_WAREHOUSE", { targetTable: "inv_warehouse", targetId: warehouseCode });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/inventory/warehouses/[warehouseCode]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "WAREHOUSE", "delete");
  if (denied) return denied;

  const { warehouseCode } = await ctx.params;
  const existing = await prisma.invWarehouse.findUnique({ where: { WarehouseCode: warehouseCode } });
  if (!existing) return apiError(404, "WAREHOUSE_NOT_FOUND");

  const updated = await prisma.invWarehouse.update({
    where: { WarehouseCode: warehouseCode },
    data: { IsActive: false, UpdatedBy: user.userId, UpdatedDate: new Date() },
  });
  await logAction(user.userId, "DEACTIVATE_WAREHOUSE", { targetTable: "inv_warehouse", targetId: warehouseCode });
  return apiSuccess(updated);
}
