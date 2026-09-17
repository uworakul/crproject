import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { REQUEST_TYPE_DOCTYPE, type RequestType } from "@/lib/request";
import RequestDetailView from "./request-detail-view";

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await verifySession();
  if (!user) redirect("/login");

  const { id } = await params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) notFound();

  const request = await prisma.trnRequest.findUnique({
    where: { RequestID: requestId },
    include: { Employee: { select: { FullName: true } } },
  });
  if (!request) notFound();

  const docType = REQUEST_TYPE_DOCTYPE[request.RequestType as RequestType];
  const canRead = await hasPermission(user, docType, "read");
  if (!canRead) redirect("/");

  const [canSave, canApprove] = await Promise.all([
    hasPermission(user, docType, "save"),
    hasPermission(user, docType, "approve"),
  ]);

  return (
    <div className="mx-auto max-w-2xl p-8">
      <Link href="/requests" className="text-sm text-gray-500 hover:underline">
        ← กลับการขออนุมัติ
      </Link>
      <h1 className="mb-6 mt-2 text-lg font-semibold text-gray-900">คำขอ #{request.RequestID}</h1>
      <RequestDetailView request={JSON.parse(JSON.stringify(request))} canSave={canSave} canApprove={canApprove} />
    </div>
  );
}
