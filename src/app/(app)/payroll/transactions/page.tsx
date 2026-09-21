import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import TransactionEntryView from "./transaction-entry-view";

export default async function PayrollTransactionsPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "PAYROLL_TRANSACTION", "read");
  if (!canRead) redirect("/");

  const [canSave, canDelete, periodsRaw, companies, employees, incomeTypes, deductionTypes] = await Promise.all([
    hasPermission(user, "PAYROLL_TRANSACTION", "save"),
    hasPermission(user, "PAYROLL_TRANSACTION", "delete"),
    prisma.sysPeriod.findMany({ orderBy: { PeriodID: "desc" } }),
    prisma.refCompany.findMany({ orderBy: { CompanyCode: "asc" }, select: { CompanyCode: true, CompanyName: true } }),
    prisma.mstEmployee.findMany({
      where: { EmployeeStatus: "ACTIVE" },
      orderBy: { EmpCode: "asc" },
      select: { EmpCode: true, FullName: true, EmployeeType: true, CompanyCode: true },
    }),
    prisma.refIncomeType.findMany({ orderBy: { IncomeCode: "asc" }, select: { IncomeCode: true, IncomeName: true } }),
    prisma.refDeductionType.findMany({
      orderBy: { DeductionCode: "asc" },
      select: { DeductionCode: true, DeductionName: true, IsInstallment: true, IsAutoCalculated: true },
    }),
  ]);

  const periods = JSON.parse(JSON.stringify(periodsRaw));

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">รายการประจำงวด</h1>
      <TransactionEntryView
        periods={periods}
        companies={companies}
        employees={employees}
        incomeTypes={incomeTypes}
        deductionTypes={deductionTypes}
        canSave={canSave}
        canDelete={canDelete}
      />
    </div>
  );
}
