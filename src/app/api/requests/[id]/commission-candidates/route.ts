import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";
import { REQUEST_DOCUMENT_DOCTYPE, COMMISSION_MIN_DAYS, type RequestDocumentCode } from "@/lib/request";
import { employeeScopeWhere } from "@/lib/employee-scope";

// GET /api/requests/[id]/commission-candidates — backs the "Load" button on
// a COMMISSION (ขอเบิกค่านำพา) document's detail page (2026-09-28): finds
// every employee eligible for a referral-fee claim right now, so HR doesn't
// have to check each candidate one by one via the plain empCode search.
// Eligibility (2026-09-28, simplified per user): >=120 calendar days since
// StartDate, has a referrer, hasn't claimed before, EmployeeStatus is not
// RESIGNED, and ResignDate is null — a plainer rule than the "resigned but
// not yet past their ResignDate still counts" version this replaced
// (findRegularEmployeesForWorksheet()/pullPayrollForMonthlyEmployees()'s
// pattern elsewhere in the app). This is a convenience pre-filter, not a
// new gate: the approve endpoint remains the authoritative eligibility
// check regardless of what this returns.
export async function GET(_req: Request, ctx: RouteContext<"/api/requests/[id]/commission-candidates">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.trnRequestHeader.findUnique({ where: { RequestHeaderID: requestId } });
  if (!header) return apiError(404, "REQUEST_NOT_FOUND");
  if (header.DocumentCode !== "COMMISSION") return apiError(400, "INVALID_PARAMS", "This endpoint is only for COMMISSION documents");

  const denied = await requirePermission(user, REQUEST_DOCUMENT_DOCTYPE[header.DocumentCode as RequestDocumentCode], "save");
  if (denied) return denied;

  const cutoffStartDate = new Date(Date.now() - COMMISSION_MIN_DAYS * 86400000);

  const existingEmpCodes = new Set((await prisma.trnRequestDetail.findMany({ where: { RequestHeaderID: requestId }, select: { EmpCode: true } })).map((d) => d.EmpCode));

  const candidates = await prisma.mstEmployee.findMany({
    where: {
      StartDate: { lte: cutoffStartDate },
      ReferrerEmpCode: { not: null },
      CommissionClaimedDate: null,
      EmployeeStatus: { not: "RESIGNED" },
      ResignDate: null,
      ...employeeScopeWhere(user),
    },
    select: { EmpCode: true, FullName: true, StartDate: true, EmployeeStatus: true, ReferrerEmpCode: true, Site: { select: { SiteName: true } } },
    orderBy: { EmpCode: "asc" },
  });

  const filtered = candidates.filter((c) => !existingEmpCodes.has(c.EmpCode));

  return apiSuccess(filtered);
}
