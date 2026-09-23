import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import EmployeeReportsView from "./employee-reports-view";

// 2026-09-23 — copied from src/app/(app)/payroll/reports/page.tsx (the
// "รายงานการเงิน/หนี้ค้าง" page) at the user's request: same
// PAYROLL_REPORT permission gate (these reports come from the same
// underlying report data/API, just surfaced under a new top-level menu),
// same filter data, minus sys_period — this page never needs it since none
// of its reports are period/month/year-scoped (see employee-reports-view.tsx).
export default async function EmployeeReportsPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "PAYROLL_REPORT", "read");
  if (!canRead) redirect("/");

  const [companies, departments, sites, banks, employees] = await Promise.all([
    prisma.refCompany.findMany({ orderBy: { CompanyCode: "asc" }, select: { CompanyCode: true, CompanyName: true } }),
    prisma.refDepartment.findMany({ where: { IsActive: true }, orderBy: { DeptCode: "asc" }, select: { DeptCode: true, DeptName: true } }),
    prisma.mstSite.findMany({ where: { IsActive: true }, orderBy: { SiteCode: "asc" }, select: { SiteCode: true, SiteName: true } }),
    prisma.refBank.findMany({ where: { IsActive: true }, orderBy: { BankCode: "asc" }, select: { BankCode: true, BankNameTH: true } }),
    prisma.mstEmployee.findMany({ orderBy: { EmpCode: "asc" }, select: { EmpCode: true, FullName: true } }),
  ]);

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">รายงานพนักงาน</h1>
      <EmployeeReportsView companies={companies} departments={departments} sites={sites} banks={banks} employees={employees} />
    </div>
  );
}
