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
  const denied = await requirePermission(user, "STOCK_COUNT", "read");
  if (denied) return denied;

  const headers = await prisma.invStockCountHeader.findMany({
    include: { Details: true, Warehouse: { select: { WarehouseName: true } } },
    orderBy: { CreatedDate: "desc" },
  });
  return apiSuccess(headers);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_COUNT", "save");
  if (denied) return denied;

  let body: { warehouseCode?: unknown; countDate?: unknown; remark?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const warehouseCode = typeof body.warehouseCode === "string" ? body.warehouseCode.trim() : "";
  if (!warehouseCode) return apiError(400, "INVALID_PARAMS", "warehouseCode is required");
  const warehouse = await prisma.invWarehouse.findUnique({ where: { WarehouseCode: warehouseCode } });
  if (!warehouse) return apiError(404, "WAREHOUSE_NOT_FOUND");

  const countDate = typeof body.countDate === "string" ? body.countDate : "";
  if (!countDate) return apiError(400, "INVALID_PARAMS", "countDate is required");
  const parsedDate = new Date(countDate);
  if (Number.isNaN(parsedDate.getTime())) return apiError(400, "VALIDATION_FAILED", "countDate is invalid");

  const documentNo = await consumeDocumentNumber("STOCKCOUNT", "ตรวจนับสต๊อก");

  const created = await prisma.invStockCountHeader.create({
    data: {
      DocumentNo: documentNo,
      WarehouseCode: warehouseCode,
      CountDate: parsedDate,
      Remark: typeof body.remark === "string" && body.remark.trim() ? body.remark.trim() : null,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "CREATE_STOCK_COUNT", { targetTable: "inv_stock_count_header", targetId: String(created.StockCountHeaderID) });
  return apiSuccess(created, 201);
}
