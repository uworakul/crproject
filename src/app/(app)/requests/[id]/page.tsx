import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { REQUEST_DOCUMENT_DOCTYPE, type RequestDocumentCode } from "@/lib/request";
import RequestDetailView from "./request-detail-view";

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await verifySession();
  if (!user) redirect("/login");

  const { id } = await params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) notFound();

  const header = await prisma.trnRequestHeader.findUnique({
    where: { RequestHeaderID: requestId },
    include: {
      Details: { orderBy: { RequestDetailID: "asc" }, include: { Employee: { select: { FullName: true, EmployeeStatus: true, StartDate: true } } } },
    },
  });
  if (!header) notFound();

  const docType = REQUEST_DOCUMENT_DOCTYPE[header.DocumentCode as RequestDocumentCode];
  const canRead = await hasPermission(user, docType, "read");
  if (!canRead) redirect("/");

  const [canSave, canApprove, employees] = await Promise.all([
    hasPermission(user, docType, "save"),
    hasPermission(user, docType, "approve"),
    prisma.mstEmployee.findMany({ where: { EmployeeStatus: "ACTIVE" }, orderBy: { EmpCode: "asc" }, select: { EmpCode: true, FullName: true } }),
  ]);

  return (
    <div className="w-full px-6 py-8">
      <Link href="/requests" className="text-sm text-gray-500 hover:underline">
        ← กลับการขออนุมัติ
      </Link>
      <h1 className="mb-6 mt-2 text-lg font-semibold text-gray-900">
        {header.DocumentCode} {header.DocumentNo ? `#${header.DocumentNo}` : `(คำขอ #${header.RequestHeaderID})`}
      </h1>
      <RequestDetailView request={JSON.parse(JSON.stringify(header))} canSave={canSave} canApprove={canApprove} employees={employees} />
    </div>
  );
}
