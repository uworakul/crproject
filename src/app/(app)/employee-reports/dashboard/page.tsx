import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { getAgeDistribution } from "@/lib/reports/dashboard-data";
import DashboardView from "./dashboard-view";

// 2026-09-23 — Dashboard screen under the "ทะเบียนพนักงาน" menu. Same
// PAYROLL_REPORT permission gate as the sibling "รายงาน" page (same
// underlying data). Initial data (the default metric, no filters) is
// fetched server-side like every other page in this app; the "แสดงผล"
// button in DashboardView re-fetches from an event handler when the
// viewer changes metric/chart type/filters — never from an effect, per
// this project's established convention.
export default async function EmployeeDashboardPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "PAYROLL_REPORT", "read");
  if (!canRead) redirect("/");

  const [companies, departments, sites, banks, employees, periodsRaw, initialResult] = await Promise.all([
    prisma.refCompany.findMany({ orderBy: { CompanyCode: "asc" }, select: { CompanyCode: true, CompanyName: true } }),
    prisma.refDepartment.findMany({ where: { IsActive: true }, orderBy: { DeptCode: "asc" }, select: { DeptCode: true, DeptName: true } }),
    prisma.mstSite.findMany({ where: { IsActive: true }, orderBy: { SiteCode: "asc" }, select: { SiteCode: true, SiteName: true } }),
    prisma.refBank.findMany({ where: { IsActive: true }, orderBy: { BankCode: "asc" }, select: { BankCode: true, BankNameTH: true } }),
    prisma.mstEmployee.findMany({ orderBy: { EmpCode: "asc" }, select: { EmpCode: true, FullName: true } }),
    prisma.sysPeriod.findMany({ orderBy: { PeriodID: "desc" } }),
    getAgeDistribution({}),
  ]);
  const periods = JSON.parse(JSON.stringify(periodsRaw));

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">Dashboard</h1>
      <DashboardView companies={companies} departments={departments} sites={sites} banks={banks} employees={employees} periods={periods} initialResult={initialResult} />
    </div>
  );
}
