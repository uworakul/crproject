import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import LeaveBalancesView from "./leave-balances-view";

export default async function LeaveBalancesPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "LEAVE_REQUEST", "read");
  if (!canRead) redirect("/");

  const canSave = await hasPermission(user, "LEAVE_REQUEST", "save");
  const employees = await prisma.mstEmployee.findMany({
    where: { EmployeeStatus: "ACTIVE" },
    orderBy: { EmpCode: "asc" },
    select: { EmpCode: true, FullName: true },
  });

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">สิทธิวันลาพนักงาน</h1>
      <LeaveBalancesView employees={employees} canSave={canSave} />
    </div>
  );
}
