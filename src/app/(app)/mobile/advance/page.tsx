import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { requireSelfEmployee } from "@/lib/mobile-auth";
import { getMobileAdvances } from "@/lib/mobile-requests";
import MobileAdvanceView from "./mobile-advance-view";

export default async function MobileAdvancePage() {
  const user = await verifySession();
  if (!user) redirect("/login");
  const me = await requireSelfEmployee(user);
  if ("error" in me) redirect("/");

  const initial = await getMobileAdvances(me.employee.EmpCode);
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <h1 className="text-xl font-semibold text-gray-900">ขอเบิกล่วงหน้า</h1>
      <p className="mt-1 text-sm text-gray-500">
        {me.employee.FullName} ({me.employee.EmpCode})
      </p>
      <MobileAdvanceView initial={initial} />
    </div>
  );
}
