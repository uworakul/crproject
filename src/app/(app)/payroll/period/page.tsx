import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import PayrollWorkspace from "./payroll-workspace";

export default async function PayrollPeriodPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const [
    canViewTransaction,
    canEditTransaction,
    canCalculate,
    canCancelCalculate,
    canViewLock,
    canLock,
    canClose,
    canViewReport,
  ] = await Promise.all([
    hasPermission(user, "PAYROLL_TRANSACTION", "read"),
    hasPermission(user, "PAYROLL_TRANSACTION", "save"),
    hasPermission(user, "PAYROLL_CALCULATE", "save"),
    hasPermission(user, "PAYROLL_CANCEL_CALCULATE", "save"),
    hasPermission(user, "PAYROLL_LOCK", "read"),
    hasPermission(user, "PAYROLL_LOCK", "approve"),
    hasPermission(user, "PAYROLL_CLOSING", "approve"),
    hasPermission(user, "PAYROLL_REPORT", "read"),
  ]);

  if (!canViewTransaction && !canCalculate && !canViewLock && !canViewReport) redirect("/");

  const periodsRaw = await prisma.sysPeriod.findMany({ orderBy: [{ PeriodYear: "desc" }, { PeriodMonth: "desc" }] });
  const periods = JSON.parse(JSON.stringify(periodsRaw));

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">ประมวลผลเงินเดือน</h1>
      <PayrollWorkspace
        initialPeriods={periods}
        canViewTransaction={canViewTransaction}
        canEditTransaction={canEditTransaction}
        canCalculate={canCalculate}
        canCancelCalculate={canCancelCalculate}
        canViewLock={canViewLock}
        canLock={canLock}
        canClose={canClose}
        canViewReport={canViewReport}
      />
    </div>
  );
}
