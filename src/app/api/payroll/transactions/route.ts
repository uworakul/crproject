import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PAYROLL_TRANSACTION", "read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const periodId = Number(searchParams.get("periodId"));
  if (!Number.isInteger(periodId)) return apiError(400, "INVALID_PARAMS", "periodId is required and must be an integer");
  const companyCode = searchParams.get("companyCode") || undefined;
  const deptCode = searchParams.get("deptCode") || undefined;
  const empCode = searchParams.get("empCode") || undefined;

  const transactions = await prisma.trnPayrollTransaction.findMany({
    where: {
      PeriodID: periodId,
      ...(empCode ? { EmpCode: empCode } : {}),
      ...(companyCode || deptCode
        ? { Employee: { ...(companyCode ? { CompanyCode: companyCode } : {}), ...(deptCode ? { DeptCode: deptCode } : {}) } }
        : {}),
    },
    include: {
      // Department/Site here are the EMPLOYEE's own DeptCode/DefaultSiteCode
      // (2026-09-21, "รายการประจำงวด" list — "แผนก"/"หน่วยงานต้นสังกัด"),
      // distinct from the top-level Site relation below (the transaction's
      // own SiteCode, snapshotted by Worksheet approve / defaulted at
      // creation — used by the Calculate screen's "หน่วยงานหลัก" column).
      Employee: { select: { EmpCode: true, FullName: true, Department: { select: { DeptName: true } }, Site: { select: { SiteName: true } } } },
      Site: { select: { SiteCode: true, SiteName: true } },
    },
    orderBy: { EmpCode: "asc" },
  });
  return apiSuccess(transactions);
}
