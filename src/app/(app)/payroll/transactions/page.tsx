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

  const [canSave, employees, incomeTypes, deductionTypes] = await Promise.all([
    hasPermission(user, "PAYROLL_TRANSACTION", "save"),
    prisma.mstEmployee.findMany({ where: { EmployeeStatus: "ACTIVE" }, orderBy: { EmpCode: "asc" }, select: { EmpCode: true, FullName: true } }),
    prisma.refIncomeType.findMany({ orderBy: { IncomeCode: "asc" }, select: { IncomeCode: true, IncomeName: true } }),
    prisma.refDeductionType.findMany({ orderBy: { DeductionCode: "asc" }, select: { DeductionCode: true, DeductionName: true } }),
  ]);

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">รายการประจำงวด</h1>
      <TransactionEntryView employees={employees} incomeTypes={incomeTypes} deductionTypes={deductionTypes} canSave={canSave} />
    </div>
  );
}
