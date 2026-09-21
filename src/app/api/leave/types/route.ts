import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { isValidTenureCountFrom } from "@/lib/leave";
import { isValidEmployeeType } from "@/lib/validation";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "read");
  if (denied) return denied;

  const types = await prisma.mstLeaveType.findMany({ orderBy: { LeaveTypeCode: "asc" } });
  return apiSuccess(types);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "save");
  if (denied) return denied;

  let body: {
    leaveTypeCode?: unknown;
    leaveTypeName?: unknown;
    maxDaysPerYear?: unknown;
    requireMedicalCert?: unknown;
    basedOnTenure?: unknown;
    eligibleEmployeeType?: unknown;
    tenureCountFrom?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const leaveTypeCode = typeof body.leaveTypeCode === "string" ? body.leaveTypeCode.trim() : "";
  const leaveTypeName = typeof body.leaveTypeName === "string" ? body.leaveTypeName.trim() : "";
  const maxDaysPerYear = Number(body.maxDaysPerYear);
  if (!leaveTypeCode || !leaveTypeName) return apiError(400, "INVALID_PARAMS", "leaveTypeCode and leaveTypeName are required");
  if (!Number.isInteger(maxDaysPerYear) || maxDaysPerYear < 0) return apiError(400, "VALIDATION_FAILED", "maxDaysPerYear must be a non-negative integer");

  const eligibleEmployeeType = typeof body.eligibleEmployeeType === "string" && body.eligibleEmployeeType ? body.eligibleEmployeeType : null;
  if (eligibleEmployeeType !== null && !isValidEmployeeType(eligibleEmployeeType)) {
    return apiError(400, "VALIDATION_FAILED", "eligibleEmployeeType must be a valid EmployeeType or omitted");
  }
  const basedOnTenure = body.basedOnTenure === true;
  const tenureCountFrom = typeof body.tenureCountFrom === "string" && body.tenureCountFrom ? body.tenureCountFrom : null;
  if (basedOnTenure && !isValidTenureCountFrom(tenureCountFrom)) {
    return apiError(400, "VALIDATION_FAILED", "tenureCountFrom is required and must be START_DATE or PROBATION_PASS_DATE when basedOnTenure is true");
  }

  const existing = await prisma.mstLeaveType.findUnique({ where: { LeaveTypeCode: leaveTypeCode } });
  if (existing) return apiError(409, "LEAVE_TYPE_ALREADY_EXISTS", undefined, { leaveTypeCode });

  const created = await prisma.mstLeaveType.create({
    data: {
      LeaveTypeCode: leaveTypeCode,
      LeaveTypeName: leaveTypeName,
      MaxDaysPerYear: maxDaysPerYear,
      RequireMedicalCert: body.requireMedicalCert === true,
      BasedOnTenure: basedOnTenure,
      EligibleEmployeeType: eligibleEmployeeType,
      TenureCountFrom: basedOnTenure ? tenureCountFrom : null,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "CREATE_LEAVE_TYPE", { targetTable: "mst_leave_type", targetId: leaveTypeCode });
  return apiSuccess(created, 201);
}
