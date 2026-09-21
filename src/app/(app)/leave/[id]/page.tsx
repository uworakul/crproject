import { redirect, notFound } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import LeaveDetailView from "./leave-detail-view";

export default async function LeaveDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "LEAVE_REQUEST", "read");
  if (!canRead) redirect("/");

  const { id } = await params;
  const leaveId = Number(id);
  if (!Number.isInteger(leaveId)) notFound();

  const [canSave, canApprove, leaveRaw] = await Promise.all([
    hasPermission(user, "LEAVE_REQUEST", "save"),
    hasPermission(user, "LEAVE_REQUEST", "approve"),
    prisma.trnLeaveRequest.findUnique({
      where: { LeaveID: leaveId },
      include: { Employee: { select: { FullName: true } }, LeaveType: true },
    }),
  ]);
  if (!leaveRaw) notFound();

  const leave = JSON.parse(JSON.stringify(leaveRaw));

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">รายละเอียดใบลา {leave.DocumentNo ? `#${leave.DocumentNo}` : `#${leave.LeaveID}`}</h1>
      <LeaveDetailView leave={leave} canSave={canSave} canApprove={canApprove} />
    </div>
  );
}
