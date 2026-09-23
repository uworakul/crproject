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
  const denied = await requirePermission(user, "STOCK_ISSUE", "read");
  if (denied) return denied;

  const headers = await prisma.invIssueHeader.findMany({
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
  const denied = await requirePermission(user, "STOCK_ISSUE", "save");
  if (denied) return denied;

  let body: {
    warehouseCode?: unknown;
    deliveryNo?: unknown;
    deliveryDate?: unknown;
    empCode?: unknown;
    cashReceived?: unknown;
    deductPerPeriod?: unknown;
    remark?: unknown;
  };
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
  // Server-side mirror of the employee-picker dropdown's own filter
  // (EmployeeStatus="ACTIVE") — the dropdown hiding a resigned employee was
  // never actually enforced here, so a resigned EmpCode could still receive
  // a new issue document by calling this endpoint directly. Found via an
  // explicit negative-test request (2026-09-24).
  if (employee.EmployeeStatus !== "ACTIVE") {
    return apiError(409, "EMPLOYEE_NOT_ELIGIBLE", "This employee's status does not allow issuing new stock to them", { empCode, employeeStatus: employee.EmployeeStatus });
  }

  const deliveryDate = typeof body.deliveryDate === "string" ? body.deliveryDate : "";
  if (!deliveryDate) return apiError(400, "INVALID_PARAMS", "deliveryDate is required");
  const parsedDate = new Date(deliveryDate);
  if (Number.isNaN(parsedDate.getTime())) return apiError(400, "VALIDATION_FAILED", "deliveryDate is invalid");

  const cashReceived = Number(body.cashReceived ?? 0);
  if (!Number.isFinite(cashReceived) || cashReceived < 0) return apiError(400, "VALIDATION_FAILED", "cashReceived must be a non-negative number");
  const deductPerPeriod = body.deductPerPeriod !== undefined && body.deductPerPeriod !== null && body.deductPerPeriod !== "" ? Number(body.deductPerPeriod) : null;
  if (deductPerPeriod !== null && (!Number.isFinite(deductPerPeriod) || deductPerPeriod < 0)) {
    return apiError(400, "VALIDATION_FAILED", "deductPerPeriod must be a non-negative number");
  }

  const documentNo = await consumeDocumentNumber("STOCKSALE", "จำหน่ายสินค้า");

  const created = await prisma.invIssueHeader.create({
    data: {
      DocumentNo: documentNo,
      WarehouseCode: warehouseCode,
      DeliveryNo: typeof body.deliveryNo === "string" && body.deliveryNo.trim() ? body.deliveryNo.trim() : null,
      DeliveryDate: parsedDate,
      EmpCode: empCode,
      CashReceived: cashReceived,
      DeductPerPeriod: deductPerPeriod,
      Remark: typeof body.remark === "string" && body.remark.trim() ? body.remark.trim() : null,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "CREATE_STOCK_ISSUE", { targetTable: "inv_issue_header", targetId: String(created.IssueHeaderID) });
  return apiSuccess(created, 201);
}
