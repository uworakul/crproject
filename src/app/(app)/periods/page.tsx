import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import PeriodsView from "./periods-view";

export default async function PeriodsPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "PERIOD", "read");
  if (!canRead) redirect("/");

  const [periods, canSave, canDelete] = await Promise.all([
    prisma.sysPeriod.findMany({ orderBy: [{ EmployeeType: "asc" }, { PayDate: "asc" }] }),
    hasPermission(user, "PERIOD", "save"),
    hasPermission(user, "PERIOD", "delete"),
  ]);

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">งวดการจ่าย</h1>
      <PeriodsView initialPeriods={JSON.parse(JSON.stringify(periods))} canSave={canSave} canDelete={canDelete} />
    </div>
  );
}
