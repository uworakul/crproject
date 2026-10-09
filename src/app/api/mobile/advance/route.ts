import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireSelfEmployee } from "@/lib/mobile-auth";
import { consumeDocumentNumber } from "@/lib/document-number";
import { getMobileAdvances, todayInThailand } from "@/lib/mobile-requests";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const me = await requireSelfEmployee(user);
  if ("error" in me) return me.error;
  return apiSuccess({ requests: await getMobileAdvances(me.employee.EmpCode) });
}

// POST { amount, deductPerPeriod?, remark? }: files an ADVANCE request for the
// logged-in employee themself (empCode is never read from the body) and
// submits it in the same step.
export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const me = await requireSelfEmployee(user);
  if ("error" in me) return me.error;
  const employee = me.employee;

  let body: { amount?: unknown; deductPerPeriod?: unknown; remark?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return apiError(400, "INVALID_PARAMS", "amount (>0) is required");
  const deductRaw = body.deductPerPeriod === undefined || body.deductPerPeriod === null || body.deductPerPeriod === "" ? amount : Number(body.deductPerPeriod);
  if (!Number.isFinite(deductRaw) || deductRaw <= 0 || deductRaw > amount) {
    return apiError(400, "INVALID_PARAMS", "deductPerPeriod must be greater than 0 and not more than amount");
  }
  if (employee.EmployeeStatus !== "ACTIVE") {
    return apiError(409, "EMPLOYEE_NOT_ELIGIBLE", "This employee's status does not allow filing a new request", { employeeStatus: employee.EmployeeStatus });
  }

  const documentNo = await consumeDocumentNumber("ADVANCE", "เอกสาร ADVANCE");
  const created = await prisma.trnRequestHeader.create({
    data: {
      DocumentCode: "ADVANCE",
      DocumentNo: documentNo,
      RequestDate: todayInThailand(),
      Remark: typeof body.remark === "string" && body.remark.trim() ? body.remark.trim() : null,
      Status: "SUBMITTED",
      SubmittedDate: new Date(),
      CreatedBy: user.userId,
      Details: { create: [{ EmpCode: employee.EmpCode, Amount: amount, DeductPerPeriod: deductRaw, CreatedBy: user.userId }] },
    },
  });
  await logAction(user.userId, "CREATE_REQUEST", { targetTable: "trn_request_header", targetId: String(created.RequestHeaderID), detail: "MOBILE (submitted)" });
  return apiSuccess({ requestHeaderId: created.RequestHeaderID, documentNo: created.DocumentNo }, 201);
}
