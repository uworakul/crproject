import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "WAREHOUSE", "read");
  if (denied) return denied;

  const warehouses = await prisma.invWarehouse.findMany({ orderBy: { WarehouseCode: "asc" } });
  return apiSuccess(warehouses);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "WAREHOUSE", "save");
  if (denied) return denied;

  let body: { warehouseCode?: unknown; warehouseName?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const warehouseCode = typeof body.warehouseCode === "string" ? body.warehouseCode.trim() : "";
  const warehouseName = typeof body.warehouseName === "string" ? body.warehouseName.trim() : "";
  if (!warehouseCode || !warehouseName) return apiError(400, "INVALID_PARAMS", "warehouseCode and warehouseName are required");

  const existing = await prisma.invWarehouse.findUnique({ where: { WarehouseCode: warehouseCode } });
  if (existing) return apiError(409, "WAREHOUSE_ALREADY_EXISTS", undefined, { warehouseCode });

  const created = await prisma.invWarehouse.create({ data: { WarehouseCode: warehouseCode, WarehouseName: warehouseName } });
  await logAction(user.userId, "CREATE_WAREHOUSE", { targetTable: "inv_warehouse", targetId: warehouseCode });
  return apiSuccess(created, 201);
}
