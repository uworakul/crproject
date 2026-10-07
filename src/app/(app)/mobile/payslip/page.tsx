import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { requireSelfEmployee } from "@/lib/mobile-auth";
import { listViewablePayslipPeriods } from "@/lib/mobile-leave";
import MobilePayslipView from "./mobile-payslip-view";

export default async function MobilePayslipPage() {
  const user = await verifySession();
  if (!user) redirect("/login");
  const me = await requireSelfEmployee(user);
  if ("error" in me) redirect("/");

  const periods = await listViewablePayslipPeriods(me.employee.EmpCode);
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <h1 className="text-xl font-semibold text-gray-900">Payslip</h1>
      <p className="mt-1 text-sm text-gray-500">
        {me.employee.FullName} ({me.employee.EmpCode})
      </p>
      <MobilePayslipView periods={periods} />
    </div>
  );
}
