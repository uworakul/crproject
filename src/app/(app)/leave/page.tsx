import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import LeaveListView from "./leave-list-view";

export default async function LeavePage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "LEAVE_REQUEST", "read");
  if (!canRead) redirect("/");

  const [canSave, canApprove, requestsRaw, employees, leaveTypes] = await Promise.all([
    hasPermission(user, "LEAVE_REQUEST", "save"),
    hasPermission(user, "LEAVE_REQUEST", "approve"),
    prisma.trnLeaveRequest.findMany({
      include: { Employee: { select: { FullName: true } }, LeaveType: { select: { LeaveTypeName: true } } },
      orderBy: { CreatedDate: "desc" },
    }),
    prisma.mstEmployee.findMany({ where: { EmployeeStatus: "ACTIVE" }, orderBy: { EmpCode: "asc" }, select: { EmpCode: true, FullName: true, EmployeeType: true } }),
    prisma.mstLeaveType.findMany({ orderBy: { LeaveTypeCode: "asc" } }),
  ]);

  const requests = JSON.parse(JSON.stringify(requestsRaw));

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">บันทึกใบลา</h1>
      <LeaveListView initialRows={requests} employees={employees} leaveTypes={leaveTypes} canSave={canSave} canApprove={canApprove} />
    </div>
  );
}
