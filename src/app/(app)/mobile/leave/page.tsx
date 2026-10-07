import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { requireSelfEmployee } from "@/lib/mobile-auth";
import { getMobileLeaveData } from "@/lib/mobile-leave";
import MobileLeaveView from "./mobile-leave-view";

export default async function MobileLeavePage() {
  const user = await verifySession();
  if (!user) redirect("/login");
  const me = await requireSelfEmployee(user);
  if ("error" in me) redirect("/");

  const initial = await getMobileLeaveData(me.employee, new Date().getFullYear());
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <h1 className="text-xl font-semibold text-gray-900">ใบลา</h1>
      <p className="mt-1 text-sm text-gray-500">
        {me.employee.FullName} ({me.employee.EmpCode})
      </p>
      <MobileLeaveView initial={initial} />
    </div>
  );
}
