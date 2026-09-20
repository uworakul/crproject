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
  const denied = await requirePermission(user, "STOCK_TRANSFER", "read");
  if (denied) return denied;

  const headers = await prisma.invTransferHeader.findMany({
    include: {
      Details: true,
      SourceWarehouse: { select: { WarehouseName: true } },
      TargetWarehouse: { select: { WarehouseName: true } },
    },
    orderBy: { CreatedDate: "desc" },
  });
  return apiSuccess(headers);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_TRANSFER", "save");
  if (denied) return denied;

  let body: { sourceWarehouseCode?: unknown; targetWarehouseCode?: unknown; deliveryNo?: unknown; deliveryDate?: unknown; remark?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const sourceWarehouseCode = typeof body.sourceWarehouseCode === "string" ? body.sourceWarehouseCode.trim() : "";
  const targetWarehouseCode = typeof body.targetWarehouseCode === "string" ? body.targetWarehouseCode.trim() : "";
  if (!sourceWarehouseCode || !targetWarehouseCode) return apiError(400, "INVALID_PARAMS", "sourceWarehouseCode and targetWarehouseCode are required");
  if (sourceWarehouseCode === targetWarehouseCode) return apiError(400, "VALIDATION_FAILED", "targetWarehouseCode must differ from sourceWarehouseCode");

  const [source, target] = await Promise.all([
    prisma.invWarehouse.findUnique({ where: { WarehouseCode: sourceWarehouseCode } }),
    prisma.invWarehouse.findUnique({ where: { WarehouseCode: targetWarehouseCode } }),
  ]);
  if (!source) return apiError(404, "WAREHOUSE_NOT_FOUND", undefined, { warehouseCode: sourceWarehouseCode });
  if (!target) return apiError(404, "WAREHOUSE_NOT_FOUND", undefined, { warehouseCode: targetWarehouseCode });

  const deliveryDate = typeof body.deliveryDate === "string" ? body.deliveryDate : "";
  if (!deliveryDate) return apiError(400, "INVALID_PARAMS", "deliveryDate is required");
  const parsedDate = new Date(deliveryDate);
  if (Number.isNaN(parsedDate.getTime())) return apiError(400, "VALIDATION_FAILED", "deliveryDate is invalid");

  const documentNo = await consumeDocumentNumber("STOCKTRF", "โอนสินค้า");

  const created = await prisma.invTransferHeader.create({
    data: {
      DocumentNo: documentNo,
      SourceWarehouseCode: sourceWarehouseCode,
      TargetWarehouseCode: targetWarehouseCode,
      DeliveryNo: typeof body.deliveryNo === "string" && body.deliveryNo.trim() ? body.deliveryNo.trim() : null,
      DeliveryDate: parsedDate,
      Remark: typeof body.remark === "string" && body.remark.trim() ? body.remark.trim() : null,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "CREATE_STOCK_TRANSFER", { targetTable: "inv_transfer_header", targetId: String(created.TransferHeaderID) });
  return apiSuccess(created, 201);
}
