import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { isValidRequestType, REQUEST_TYPE_DOCTYPE } from "@/lib/request";

export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const type = request.nextUrl.searchParams.get("type");
  if (!isValidRequestType(type)) {
    return apiError(400, "INVALID_PARAMS", "type must be ADVANCE, LOAN, or TRAINING");
  }

  const denied = await requirePermission(user, REQUEST_TYPE_DOCTYPE[type], "read");
  if (denied) return denied;

  const requests = await prisma.trnRequest.findMany({
    where: { RequestType: type },
    include: { Employee: { select: { FullName: true } } },
    orderBy: { CreatedDate: "desc" },
  });
  return apiSuccess(requests);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  let body: { requestType?: unknown; empCode?: unknown; amount?: unknown; deductPerPeriod?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  if (!isValidRequestType(body.requestType)) {
    return apiError(400, "VALIDATION_FAILED", "requestType must be ADVANCE, LOAN, or TRAINING");
  }

  const denied = await requirePermission(user, REQUEST_TYPE_DOCTYPE[body.requestType], "save");
  if (denied) return denied;

  const empCode = typeof body.empCode === "string" ? body.empCode.trim() : "";
  const amount = Number(body.amount);
  const deductPerPeriod = Number(body.deductPerPeriod);

  if (!empCode || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(deductPerPeriod) || deductPerPeriod < 0) {
    return apiError(400, "INVALID_PARAMS", "empCode, amount (>0), and deductPerPeriod (>=0) are required");
  }

  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND", undefined, { empCode });

  const created = await prisma.trnRequest.create({
    data: {
      RequestType: body.requestType,
      EmpCode: empCode,
      Amount: amount,
      DeductPerPeriod: deductPerPeriod,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "CREATE_REQUEST", { targetTable: "trn_request", targetId: String(created.RequestID) });
  return apiSuccess(created, 201);
}
