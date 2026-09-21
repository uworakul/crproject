import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import PayrollCalculateView from "./payroll-calculate-view";

export default async function PayrollCalculatePage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "PAYROLL_CALCULATE", "read");
  if (!canRead) redirect("/");

  const [canCalculate, canLock, canReadLock, periodsRaw, companies, departments, employees] = await Promise.all([
    hasPermission(user, "PAYROLL_CALCULATE", "save"),
    hasPermission(user, "PAYROLL_LOCK", "approve"),
    hasPermission(user, "PAYROLL_LOCK", "read"),
    prisma.sysPeriod.findMany({ orderBy: { PeriodID: "desc" } }),
    prisma.refCompany.findMany({ orderBy: { CompanyCode: "asc" }, select: { CompanyCode: true, CompanyName: true } }),
    prisma.refDepartment.findMany({ where: { IsActive: true }, orderBy: { DeptCode: "asc" }, select: { DeptCode: true, DeptName: true } }),
    prisma.mstEmployee.findMany({ where: { EmployeeStatus: "ACTIVE" }, orderBy: { EmpCode: "asc" }, select: { EmpCode: true, FullName: true } }),
  ]);

  const periods = JSON.parse(JSON.stringify(periodsRaw));

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">คำนวณเงินได้ประจำงวด</h1>
      <PayrollCalculateView
        periods={periods}
        companies={companies}
        departments={departments}
        employees={employees}
        canCalculate={canCalculate}
        canLock={canLock}
        canReadLock={canReadLock}
      />
    </div>
  );
}
