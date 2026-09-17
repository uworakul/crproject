import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { MOVEMENT_TYPE_DOCTYPE, MOVEMENT_TYPE_VALUES, toMovementDetailData, validateMovementFields, type MovementType } from "@/lib/inventory";

export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  if (!type || !(MOVEMENT_TYPE_VALUES as readonly string[]).includes(type)) {
    return apiError(400, "INVALID_PARAMS", "type is required and must be one of " + MOVEMENT_TYPE_VALUES.join(", "));
  }

  const denied = await requirePermission(user, MOVEMENT_TYPE_DOCTYPE[type as MovementType], "read");
  if (denied) return denied;

  const status = searchParams.get("status");
  const movements = await prisma.invStockMovement.findMany({
    where: { MovementType: type, ...(status ? { Status: status } : {}) },
    include: { Details: true },
    orderBy: { MovementID: "desc" },
  });
  return apiSuccess(movements);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  let body: {
    movementType?: unknown;
    warehouseCode?: unknown;
    targetWarehouseCode?: unknown;
    supplierCode?: unknown;
    empCode?: unknown;
    movementDate?: unknown;
    details?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const movementType = typeof body.movementType === "string" ? body.movementType : "";
  if (!(MOVEMENT_TYPE_VALUES as readonly string[]).includes(movementType)) {
    return apiError(400, "INVALID_PARAMS", "movementType must be one of " + MOVEMENT_TYPE_VALUES.join(", "));
  }
  const type = movementType as MovementType;

  const denied = await requirePermission(user, MOVEMENT_TYPE_DOCTYPE[type], "save");
  if (denied) return denied;

  const warehouseCode = typeof body.warehouseCode === "string" ? body.warehouseCode.trim() : "";
  if (!warehouseCode) return apiError(400, "INVALID_PARAMS", "warehouseCode is required");
  const targetWarehouseCode = typeof body.targetWarehouseCode === "string" && body.targetWarehouseCode.trim() ? body.targetWarehouseCode.trim() : null;
  const supplierCode = typeof body.supplierCode === "string" && body.supplierCode.trim() ? body.supplierCode.trim() : null;
  const empCode = typeof body.empCode === "string" && body.empCode.trim() ? body.empCode.trim() : null;

  const fieldError = validateMovementFields(type, { warehouseCode, targetWarehouseCode, supplierCode, empCode });
  if (fieldError) return apiError(400, "VALIDATION_FAILED", fieldError);

  const warehouse = await prisma.invWarehouse.findUnique({ where: { WarehouseCode: warehouseCode } });
  if (!warehouse) return apiError(404, "WAREHOUSE_NOT_FOUND", undefined, { warehouseCode });
  if (targetWarehouseCode) {
    const target = await prisma.invWarehouse.findUnique({ where: { WarehouseCode: targetWarehouseCode } });
    if (!target) return apiError(404, "WAREHOUSE_NOT_FOUND", undefined, { warehouseCode: targetWarehouseCode });
  }
  if (supplierCode) {
    const supplier = await prisma.invSupplier.findUnique({ where: { SupplierCode: supplierCode } });
    if (!supplier) return apiError(404, "SUPPLIER_NOT_FOUND", undefined, { supplierCode });
  }
  if (empCode) {
    const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
    if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND", undefined, { empCode });
  }

  const movementDate = typeof body.movementDate === "string" && body.movementDate ? new Date(body.movementDate) : new Date();
  if (Number.isNaN(movementDate.getTime())) return apiError(400, "VALIDATION_FAILED", "movementDate is invalid");

  const rawDetails = Array.isArray(body.details) ? body.details : [];
  const detailEntries = rawDetails as { productCode?: unknown; qty?: unknown; unitPrice?: unknown }[];
  for (const d of detailEntries) {
    if (typeof d.productCode !== "string" || !d.productCode.trim()) return apiError(400, "VALIDATION_FAILED", "Each detail line requires productCode");
    const qty = Number(d.qty);
    if (!Number.isFinite(qty) || qty === 0) return apiError(400, "VALIDATION_FAILED", "Each detail line requires a non-zero qty");
    if (type !== "ADJUST" && qty < 0) return apiError(400, "VALIDATION_FAILED", "qty must be positive for this movement type");
    const unitPrice = Number(d.unitPrice ?? 0);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return apiError(400, "VALIDATION_FAILED", "unitPrice must be a non-negative number");
  }

  const productCodes = [...new Set(detailEntries.map((d) => (d.productCode as string).trim()))];
  if (productCodes.length > 0) {
    const products = await prisma.invProduct.findMany({ where: { ProductCode: { in: productCodes } } });
    if (products.length !== productCodes.length) {
      const found = new Set(products.map((p) => p.ProductCode));
      const missing = productCodes.filter((c) => !found.has(c));
      return apiError(404, "PRODUCT_NOT_FOUND", undefined, { productCodes: missing });
    }
  }

  const movement = await prisma.invStockMovement.create({
    data: {
      MovementType: type,
      WarehouseCode: warehouseCode,
      TargetWarehouseCode: targetWarehouseCode,
      SupplierCode: supplierCode,
      EmpCode: empCode,
      MovementDate: movementDate,
      Status: "DRAFT",
      CreatedBy: user.userId,
      Details: {
        create: toMovementDetailData(
          detailEntries.map((d) => ({ productCode: (d.productCode as string).trim(), qty: Number(d.qty), unitPrice: Number(d.unitPrice ?? 0) })),
        ),
      },
    },
    include: { Details: true },
  });

  await logAction(user.userId, `CREATE_${type}_MOVEMENT`, { targetTable: "inv_stock_movement", targetId: String(movement.MovementID) });
  return apiSuccess(movement, 201);
}
