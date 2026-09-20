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
  const denied = await requirePermission(user, "STOCK_RETURN", "read");
  if (denied) return denied;

  const headers = await prisma.invReturnHeader.findMany({
    include: {
      Details: true,
      Warehouse: { select: { WarehouseName: true } },
      Employee: { select: { FullName: true, Site: { select: { SiteName: true } } } },
    },
    orderBy: { CreatedDate: "desc" },
  });
  return apiSuccess(headers);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_RETURN", "save");
  if (denied) return denied;

  let body: { warehouseCode?: unknown; deliveryNo?: unknown; deliveryDate?: unknown; empCode?: unknown; remark?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const warehouseCode = typeof body.warehouseCode === "string" ? body.warehouseCode.trim() : "";
  if (!warehouseCode) return apiError(400, "INVALID_PARAMS", "warehouseCode is required");
  const warehouse = await prisma.invWarehouse.findUnique({ where: { WarehouseCode: warehouseCode } });
  if (!warehouse) return apiError(404, "WAREHOUSE_NOT_FOUND");

  const empCode = typeof body.empCode === "string" ? body.empCode.trim() : "";
  if (!empCode) return apiError(400, "INVALID_PARAMS", "empCode is required");
  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND", undefined, { empCode });

  const deliveryDate = typeof body.deliveryDate === "string" ? body.deliveryDate : "";
  if (!deliveryDate) return apiError(400, "INVALID_PARAMS", "deliveryDate is required");
  const parsedDate = new Date(deliveryDate);
  if (Number.isNaN(parsedDate.getTime())) return apiError(400, "VALIDATION_FAILED", "deliveryDate is invalid");

  const documentNo = await consumeDocumentNumber("STOCKRET", "คืนสินค้า");

  const created = await prisma.invReturnHeader.create({
    data: {
      DocumentNo: documentNo,
      WarehouseCode: warehouseCode,
      DeliveryNo: typeof body.deliveryNo === "string" && body.deliveryNo.trim() ? body.deliveryNo.trim() : null,
      DeliveryDate: parsedDate,
      EmpCode: empCode,
      Remark: typeof body.remark === "string" && body.remark.trim() ? body.remark.trim() : null,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "CREATE_STOCK_RETURN", { targetTable: "inv_return_header", targetId: String(created.ReturnHeaderID) });
  return apiSuccess(created, 201);
}
