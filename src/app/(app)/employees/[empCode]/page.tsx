import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import Tabs from "../../reference/tabs";
import InfoTab from "./info-tab";
import QuotaTab from "./quota-tab";
import HistoryTab from "./history-tab";
import PayrollHistoryTab from "./payroll-history-tab";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ empCode: string }> }) {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "EMPLOYEE", "read");
  if (!canRead) redirect("/");

  const { empCode } = await params;

  const [
    employeeRaw,
    departmentsRaw,
    positionsRaw,
    sitesRaw,
    banksRaw,
    quotaRaw,
    historyRaw,
    payrollHistoryRaw,
    canSaveEmployee,
    canReadHistory,
    canSaveHistory,
    canReadPayroll,
  ] = await Promise.all([
    prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } }),
    prisma.refDepartment.findMany({ where: { IsActive: true }, orderBy: { DeptCode: "asc" } }),
    prisma.refPosition.findMany({ where: { IsActive: true }, orderBy: { PositionCode: "asc" } }),
    prisma.mstSite.findMany({ where: { IsActive: true }, orderBy: { SiteCode: "asc" } }),
    prisma.refBank.findMany({ where: { IsActive: true }, orderBy: { BankCode: "asc" } }),
    prisma.mstEmployeeQuota.findMany({ where: { EmpCode: empCode }, orderBy: { QuotaType: "asc" } }),
    prisma.mstEmployeeHistory.findMany({ where: { EmpCode: empCode }, orderBy: { RecordedDate: "desc" } }),
    prisma.trnPayrollTransaction.findMany({
      where: { EmpCode: empCode },
      include: { Period: true, Site: { select: { SiteName: true } } },
      orderBy: { CreatedDate: "desc" },
    }),
    hasPermission(user, "EMPLOYEE", "save"),
    hasPermission(user, "EMPLOYEE_HISTORY", "read"),
    hasPermission(user, "EMPLOYEE_HISTORY", "save"),
    hasPermission(user, "EMPLOYEE_PAYROLL", "read"),
  ]);

  if (!employeeRaw) notFound();

  // Prisma.Decimal and BigInt (mst_employee_history.HistoryID) aren't plain
  // values React Server Components can pass to a Client Component —
  // round-trip through JSON with a replacer that stringifies BigInt first
  // (JSON.stringify throws on raw BigInt).
  const [employee, departments, positions, sites, banks, quota, history, payrollHistory] = JSON.parse(
    JSON.stringify(
      [employeeRaw, departmentsRaw, positionsRaw, sitesRaw, banksRaw, quotaRaw, historyRaw, payrollHistoryRaw],
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    ),
  );

  const tabs = [
    {
      label: "ข้อมูลทั่วไป",
      content: (
        <InfoTab employee={employee} departments={departments} positions={positions} sites={sites} banks={banks} canSave={canSaveEmployee} />
      ),
    },
    {
      label: "วงเงิน/โควตา",
      content: <QuotaTab empCode={empCode} initialQuota={quota} canSave={canSaveEmployee} />,
    },
  ];

  if (canReadHistory) {
    tabs.push({ label: "ประวัติ", content: <HistoryTab empCode={empCode} initialHistory={history} canSave={canSaveHistory} /> });
  }
  if (canReadPayroll) {
    tabs.push({ label: "เงินเดือนย้อนหลัง", content: <PayrollHistoryTab rows={payrollHistory} /> });
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <Link href="/employees" className="text-sm text-gray-500 hover:underline">
        ← กลับทะเบียนพนักงาน
      </Link>
      <h1 className="mb-6 mt-2 text-lg font-semibold text-gray-900">
        {employee.EmpCode} — {employee.FullName}
      </h1>
      <Tabs tabs={tabs} />
    </div>
  );
}
