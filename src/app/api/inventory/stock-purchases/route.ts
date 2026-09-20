import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { consumeDocumentNumber } from "@/lib/document-number";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_PURCHASE", "read");
  if (denied) return denied;

  const headers = await prisma.invPurchaseHeader.findMany({
    include: { Details: true, Warehouse: { select: { WarehouseName: true } }, Supplier: { select: { SupplierName: true } } },
    orderBy: { CreatedDate: "desc" },
  });
  return apiSuccess(headers);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_PURCHASE", "save");
  if (denied) return denied;

  let body: { warehouseCode?: unknown; supplierCode?: unknown; supplierDeliveryNo?: unknown; deliveryDate?: unknown; remark?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const warehouseCode = typeof body.warehouseCode === "string" ? body.warehouseCode.trim() : "";
  if (!warehouseCode) return apiError(400, "INVALID_PARAMS", "warehouseCode is required");
  const warehouse = await prisma.invWarehouse.findUnique({ where: { WarehouseCode: warehouseCode } });
  if (!warehouse) return apiError(404, "WAREHOUSE_NOT_FOUND");

  const supplierCode = typeof body.supplierCode === "string" ? body.supplierCode.trim() : "";
  if (!supplierCode) return apiError(400, "INVALID_PARAMS", "supplierCode is required");
  const supplier = await prisma.invSupplier.findUnique({ where: { SupplierCode: supplierCode } });
  if (!supplier) return apiError(404, "SUPPLIER_NOT_FOUND");

  const deliveryDate = typeof body.deliveryDate === "string" ? body.deliveryDate : "";
  if (!deliveryDate) return apiError(400, "INVALID_PARAMS", "deliveryDate is required");
  const parsedDate = new Date(deliveryDate);
  if (Number.isNaN(parsedDate.getTime())) return apiError(400, "VALIDATION_FAILED", "deliveryDate is invalid");

  const documentNo = await consumeDocumentNumber("STOCKPO", "ซื้อสินค้า");

  const created = await prisma.invPurchaseHeader.create({
    data: {
      DocumentNo: documentNo,
      WarehouseCode: warehouseCode,
      SupplierCode: supplierCode,
      SupplierDeliveryNo: typeof body.supplierDeliveryNo === "string" && body.supplierDeliveryNo.trim() ? body.supplierDeliveryNo.trim() : null,
      DeliveryDate: parsedDate,
      Remark: typeof body.remark === "string" && body.remark.trim() ? body.remark.trim() : null,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "CREATE_STOCK_PURCHASE", { targetTable: "inv_purchase_header", targetId: String(created.PurchaseHeaderID) });
  return apiSuccess(created, 201);
}
