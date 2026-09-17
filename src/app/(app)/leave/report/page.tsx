import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import LeaveReportView from "./leave-report-view";

export default async function LeaveReportPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "LEAVE_REPORT", "read");
  if (!canRead) redirect("/");

  const employees = await prisma.mstEmployee.findMany({ orderBy: { EmpCode: "asc" }, select: { EmpCode: true, FullName: true } });

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">รายงานประวัติการลา</h1>
      <LeaveReportView employees={employees} />
    </div>
  );
}
