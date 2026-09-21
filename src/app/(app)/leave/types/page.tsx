import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import LeaveTypesView from "./leave-types-view";

export default async function LeaveTypesPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "REFERENCE", "read");
  if (!canRead) redirect("/");

  const [canSave, canDelete, types, tiersRaw] = await Promise.all([
    hasPermission(user, "REFERENCE", "save"),
    hasPermission(user, "REFERENCE", "delete"),
    prisma.mstLeaveType.findMany({ orderBy: { LeaveTypeCode: "asc" } }),
    prisma.mstLeaveTenureTier.findMany({ orderBy: [{ LeaveTypeCode: "asc" }, { MinYearsOfService: "asc" }] }),
  ]);
  const tiers = JSON.parse(JSON.stringify(tiersRaw));

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">ประเภทและสิทธิการลา</h1>
      <LeaveTypesView initialRows={types} initialTiers={tiers} canSave={canSave} canDelete={canDelete} />
    </div>
  );
}
