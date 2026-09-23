import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import ReportsView from "./reports-view";

export default async function PayrollReportsPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "PAYROLL_REPORT", "read");
  if (!canRead) redirect("/");

  const [periodsRaw, companies, departments, sites, banks, employees] = await Promise.all([
    prisma.sysPeriod.findMany({ orderBy: { PeriodID: "desc" } }),
    prisma.refCompany.findMany({ orderBy: { CompanyCode: "asc" }, select: { CompanyCode: true, CompanyName: true } }),
    prisma.refDepartment.findMany({ where: { IsActive: true }, orderBy: { DeptCode: "asc" }, select: { DeptCode: true, DeptName: true } }),
    prisma.mstSite.findMany({ where: { IsActive: true }, orderBy: { SiteCode: "asc" }, select: { SiteCode: true, SiteName: true } }),
    prisma.refBank.findMany({ where: { IsActive: true }, orderBy: { BankCode: "asc" }, select: { BankCode: true, BankNameTH: true } }),
    prisma.mstEmployee.findMany({ orderBy: { EmpCode: "asc" }, select: { EmpCode: true, FullName: true } }),
  ]);

  const periods = JSON.parse(JSON.stringify(periodsRaw));

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">รายงานการเงิน/หนี้ค้าง</h1>
      <ReportsView periods={periods} companies={companies} departments={departments} sites={sites} banks={banks} employees={employees} />
    </div>
  );
}
