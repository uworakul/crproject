import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { requireSelfEmployee } from "@/lib/mobile-auth";
import { getAttendanceState } from "@/lib/mobile-attendance";
import AttendanceView from "../attendance-view";

export default async function CheckInPage() {
  const user = await verifySession();
  if (!user) redirect("/login");
  const me = await requireSelfEmployee(user);
  if ("error" in me) redirect("/");

  const initial = await getAttendanceState(me.employee);
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <h1 className="text-xl font-semibold text-gray-900">เข้างาน</h1>
      <p className="mt-1 text-sm text-gray-500">
        {me.employee.FullName} ({me.employee.EmpCode})
      </p>
      <AttendanceView mode="IN" initial={initial} />
    </div>
  );
}
