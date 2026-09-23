import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { REQUEST_DOCUMENT_DOCTYPE, type RequestDocumentCode } from "@/lib/request";

// Add one employee line to a request document — allowed until the header
// is APPROVED (per the user: "เพิ่ม/แก้ไข/ลบรายการได้ จนกว่ารายการจะอนุมัติ"),
// not just while DRAFT — a SUBMITTED-but-not-yet-approved document can still
// be corrected before the approver acts on it.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/requests/[id]/details">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.trnRequestHeader.findUnique({ where: { RequestHeaderID: requestId } });
  if (!header) return apiError(404, "REQUEST_NOT_FOUND");

  const denied = await requirePermission(user, REQUEST_DOCUMENT_DOCTYPE[header.DocumentCode as RequestDocumentCode], "save");
  if (denied) return denied;

  if (header.Status === "APPROVED") {
    return apiError(409, "REQUEST_LOCKED", "An APPROVED request can no longer be edited", { status: header.Status });
  }

  let body: { empCode?: unknown; amount?: unknown; deductPerPeriod?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const empCode = typeof body.empCode === "string" ? body.empCode.trim() : "";
  const amount = Number(body.amount);
  const deductPerPeriod = Number(body.deductPerPeriod);
  if (!empCode || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(deductPerPeriod) || deductPerPeriod < 0) {
    return apiError(400, "INVALID_PARAMS", "empCode, amount (>0), and deductPerPeriod (>=0) are required");
  }

  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND", undefined, { empCode });
  // Server-side mirror of the employee-picker dropdown's own filter
  // (EmployeeStatus="ACTIVE") — the dropdown hiding a resigned employee was
  // never actually enforced here, so a resigned EmpCode could still be added
  // to a new advance/loan/training document by calling this endpoint
  // directly. Found via an explicit negative-test request (2026-09-24).
  if (employee.EmployeeStatus !== "ACTIVE") {
    return apiError(409, "EMPLOYEE_NOT_ELIGIBLE", "This employee's status does not allow adding them to a new request", { empCode, employeeStatus: employee.EmployeeStatus });
  }

  // Ordered the same way the detail page renders rows (RequestDetailID asc,
  // i.e. insertion order) so the reported position matches what the user sees.
  const existingDetails = await prisma.trnRequestDetail.findMany({
    where: { RequestHeaderID: requestId },
    orderBy: { RequestDetailID: "asc" },
    select: { EmpCode: true },
  });
  const existingIndex = existingDetails.findIndex((d) => d.EmpCode === empCode);
  if (existingIndex !== -1) {
    return apiError(409, "EMPLOYEE_ALREADY_IN_REQUEST", `มีรายการนี้แล้ว ในลำดับที่ ${existingIndex + 1}`, { empCode });
  }

  const created = await prisma.trnRequestDetail.create({
    data: {
      RequestHeaderID: requestId,
      EmpCode: empCode,
      Amount: amount,
      DeductPerPeriod: deductPerPeriod,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "ADD_REQUEST_DETAIL", {
    targetTable: "trn_request_detail",
    targetId: String(created.RequestDetailID),
    detail: `Request ${requestId}, employee ${empCode}`,
  });

  return apiSuccess({ ...created, Employee: { FullName: employee.FullName, EmployeeStatus: employee.EmployeeStatus, StartDate: employee.StartDate } }, 201);
}
