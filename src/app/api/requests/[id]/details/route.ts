import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { REQUEST_DOCUMENT_DOCTYPE, REQUEST_DOCUMENT_KIND, type RequestDocumentCode } from "@/lib/request";
import { isEmployeeInScope } from "@/lib/employee-scope";

// Add one employee line to a request document — allowed until the header
// is APPROVED (per the user: "เพิ่ม/แก้ไข/ลบรายการได้ จนกว่ารายการจะอนุมัติ"),
// not just while DRAFT — a SUBMITTED-but-not-yet-approved document can still
// be corrected before the approver acts on it.
//
// 2026-09-28 — body shape now depends on the header's DocumentCode kind
// (see REQUEST_DOCUMENT_KIND): DEBT/INCOME rows still use amount (+
// deductPerPeriod for DEBT only); PROMOTE (POSITION_CHANGE kind) takes
// newPositionCode (OldPositionCode/OldIncome are snapshotted here from the
// employee's current record, not sent by the client); RESIGN takes
// resignReason/requestedResignDate/addToBlacklist. Amount/DeductPerPeriod
// are written as 0 for the latter two kinds (NOT NULL columns, unused).
export async function POST(request: NextRequest, ctx: RouteContext<"/api/requests/[id]/details">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.trnRequestHeader.findUnique({ where: { RequestHeaderID: requestId } });
  if (!header) return apiError(404, "REQUEST_NOT_FOUND");

  const documentCode = header.DocumentCode as RequestDocumentCode;
  const denied = await requirePermission(user, REQUEST_DOCUMENT_DOCTYPE[documentCode], "save");
  if (denied) return denied;

  if (header.Status === "APPROVED") {
    return apiError(409, "REQUEST_LOCKED", "An APPROVED request can no longer be edited", { status: header.Status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const empCode = typeof body.empCode === "string" ? body.empCode.trim() : "";
  if (!empCode) return apiError(400, "INVALID_PARAMS", "empCode is required");

  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND", undefined, { empCode });
  if (!isEmployeeInScope(user, employee)) return apiError(404, "EMPLOYEE_NOT_FOUND", undefined, { empCode });
  // Server-side mirror of the employee-picker dropdown's own filter
  // (EmployeeStatus="ACTIVE") — the dropdown hiding a resigned employee was
  // never actually enforced here, so a resigned EmpCode could still be added
  // to a new advance/loan/training document by calling this endpoint
  // directly. Found via an explicit negative-test request (2026-09-24).
  // Applies to all kinds — a request naming an already-inactive employee
  // (position change, resignation included) is never valid to create fresh.
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

  const kind = REQUEST_DOCUMENT_KIND[documentCode];
  let data: {
    RequestHeaderID: number;
    EmpCode: string;
    Amount: number;
    DeductPerPeriod: number;
    OldPositionCode?: string | null;
    NewPositionCode?: string | null;
    OldIncome?: number | null;
    ResignReason?: string | null;
    RequestedResignDate?: Date | null;
    BlacklistCode?: string | null;
    CreatedBy: string;
  };

  if (kind === "DEBT" || kind === "INCOME") {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return apiError(400, "INVALID_PARAMS", "amount (>0) is required");
    // DeductPerPeriod is meaningless for INCOME rows (BONUS/COMMISSION post an
    // income line on approval, never a deduction) — accepted but defaults to
    // 0 and isn't validated as required, unlike DEBT rows where it drives
    // the deduction schedule on the debt this creates.
    let deductPerPeriod = 0;
    if (kind === "DEBT") {
      deductPerPeriod = Number(body.deductPerPeriod);
      if (!Number.isFinite(deductPerPeriod) || deductPerPeriod < 0) return apiError(400, "INVALID_PARAMS", "deductPerPeriod (>=0) is required");
    } else if (body.deductPerPeriod !== undefined) {
      const n = Number(body.deductPerPeriod);
      if (Number.isFinite(n) && n >= 0) deductPerPeriod = n;
    }
    data = { RequestHeaderID: requestId, EmpCode: empCode, Amount: amount, DeductPerPeriod: deductPerPeriod, CreatedBy: user.userId };
  } else if (kind === "POSITION_CHANGE") {
    const newPositionCode = typeof body.newPositionCode === "string" ? body.newPositionCode.trim() : "";
    if (!newPositionCode) return apiError(400, "INVALID_PARAMS", "newPositionCode is required");
    const newPosition = await prisma.refPosition.findUnique({ where: { PositionCode: newPositionCode } });
    if (!newPosition || !newPosition.IsActive) return apiError(404, "POSITION_NOT_FOUND", undefined, { newPositionCode });
    if (newPositionCode === employee.PositionCode) {
      return apiError(400, "VALIDATION_FAILED", "newPositionCode is the same as the employee's current position");
    }
    const oldIncome = employee.EmployeeType === "MONTHLY" ? employee.MonthlySalary : employee.DailyRate;
    data = {
      RequestHeaderID: requestId,
      EmpCode: empCode,
      Amount: 0,
      DeductPerPeriod: 0,
      OldPositionCode: employee.PositionCode,
      NewPositionCode: newPositionCode,
      OldIncome: oldIncome !== null ? Number(oldIncome) : null,
      CreatedBy: user.userId,
    };
  } else {
    // RESIGN
    const resignReason = typeof body.resignReason === "string" ? body.resignReason.trim() : "";
    if (!resignReason) return apiError(400, "INVALID_PARAMS", "resignReason is required");
    const requestedResignDateStr = typeof body.requestedResignDate === "string" ? body.requestedResignDate : "";
    if (!requestedResignDateStr) return apiError(400, "INVALID_PARAMS", "requestedResignDate is required");
    const requestedResignDate = new Date(requestedResignDateStr);
    if (Number.isNaN(requestedResignDate.getTime())) return apiError(400, "VALIDATION_FAILED", "requestedResignDate is invalid");
    // Same "cross-referenced manually" treatment as mst_employee.BlacklistCode
    // itself — no FK enforced, but reject a code that doesn't actually exist
    // in ref_black_list so approvers don't see a dangling reference later.
    const blacklistCode = typeof body.blacklistCode === "string" && body.blacklistCode.trim() ? body.blacklistCode.trim() : null;
    if (blacklistCode) {
      const bl = await prisma.refBlackList.findFirst({ where: { IDCardNo: blacklistCode } });
      if (!bl) return apiError(404, "BLACKLIST_CODE_NOT_FOUND", undefined, { blacklistCode });
    }
    data = {
      RequestHeaderID: requestId,
      EmpCode: empCode,
      Amount: 0,
      DeductPerPeriod: 0,
      ResignReason: resignReason,
      RequestedResignDate: requestedResignDate,
      BlacklistCode: blacklistCode,
      CreatedBy: user.userId,
    };
  }

  const created = await prisma.trnRequestDetail.create({ data });

  await logAction(user.userId, "ADD_REQUEST_DETAIL", {
    targetTable: "trn_request_detail",
    targetId: String(created.RequestDetailID),
    detail: `Request ${requestId}, employee ${empCode}`,
  });

  return apiSuccess(
    {
      ...created,
      Employee: { FullName: employee.FullName, EmployeeStatus: employee.EmployeeStatus, StartDate: employee.StartDate },
    },
    201,
  );
}
