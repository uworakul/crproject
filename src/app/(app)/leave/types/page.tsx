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

  const [canSave, canDelete, types] = await Promise.all([
    hasPermission(user, "REFERENCE", "save"),
    hasPermission(user, "REFERENCE", "delete"),
    prisma.mstLeaveType.findMany({ orderBy: { LeaveTypeCode: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">ประเภทและสิทธิการลา</h1>
      <LeaveTypesView initialRows={types} canSave={canSave} canDelete={canDelete} />
    </div>
  );
}
