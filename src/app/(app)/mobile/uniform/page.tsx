import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { requireSelfEmployee } from "@/lib/mobile-auth";
import { getMobileUniformData } from "@/lib/mobile-requests";
import MobileUniformView from "./mobile-uniform-view";

export default async function MobileUniformPage() {
  const user = await verifySession();
  if (!user) redirect("/login");
  const me = await requireSelfEmployee(user);
  if ("error" in me) redirect("/");

  const initial = await getMobileUniformData(me.employee.EmpCode);
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <h1 className="text-xl font-semibold text-gray-900">ขอเบิกชุด (ซื้อ)</h1>
      <p className="mt-1 text-sm text-gray-500">
        {me.employee.FullName} ({me.employee.EmpCode})
      </p>
      <MobileUniformView initial={initial} />
    </div>
  );
}
