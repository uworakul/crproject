import { redirect } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { REQUEST_DOCUMENT_CODE_VALUES, REQUEST_DOCUMENT_DOCTYPE, isValidRequestDocumentCode } from "@/lib/request";
import DraftListTable from "./draft-list-table";

export default async function DraftListPage({
  searchParams,
}: {
  searchParams: Promise<{ documentCode?: string; from?: string; to?: string }>;
}) {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "DRAFT_LIST", "read");
  if (!canRead) redirect("/");

  const { documentCode, from, to } = await searchParams;

  const visibleCodes = (
    await Promise.all(REQUEST_DOCUMENT_CODE_VALUES.map(async (c) => ((await hasPermission(user, REQUEST_DOCUMENT_DOCTYPE[c], "read")) ? c : null)))
  ).filter((c): c is (typeof REQUEST_DOCUMENT_CODE_VALUES)[number] => c !== null);

  // Per-code approve permission — a user might have read but not approve
  // access for some document codes, so this can't just reuse visibleCodes.
  const canApproveByCode = Object.fromEntries(
    await Promise.all(REQUEST_DOCUMENT_CODE_VALUES.map(async (c) => [c, await hasPermission(user, REQUEST_DOCUMENT_DOCTYPE[c], "approve")] as const)),
  );

  let documentCodes: string[] = visibleCodes;
  if (documentCode && isValidRequestDocumentCode(documentCode) && visibleCodes.includes(documentCode)) {
    documentCodes = [documentCode];
  }

  const where: { Status: string; DocumentCode: { in: string[] }; RequestDate?: { gte?: Date; lte?: Date } } = {
    Status: "SUBMITTED",
    DocumentCode: { in: documentCodes },
  };
  if (from || to) {
    where.RequestDate = {};
    if (from) where.RequestDate.gte = new Date(`${from}T00:00:00`);
    if (to) where.RequestDate.lte = new Date(`${to}T23:59:59`);
  }

  const rows = await prisma.trnRequestHeader.findMany({
    where,
    include: { Details: true },
    orderBy: { SubmittedDate: "asc" },
  });

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">รายการรออนุมัติ</h1>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          รหัสเอกสาร
          <select name="documentCode" defaultValue={documentCode ?? ""} className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900">
            <option value="">- ทุกเอกสาร -</option>
            {visibleCodes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          จากวันที่
          <input type="date" name="from" defaultValue={from ?? ""} className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          ถึงวันที่
          <input type="date" name="to" defaultValue={to ?? ""} className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
        </label>
        <button type="submit" className="rounded-md bg-gray-900 px-3.5 py-2 text-sm text-white hover:bg-gray-700">
          กรอง
        </button>
        <Link href="/requests/draft-list" className="rounded-md border border-gray-300 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50">
          ล้างตัวกรอง
        </Link>
      </form>

      <DraftListTable rows={JSON.parse(JSON.stringify(rows))} canApproveByCode={canApproveByCode} />
    </div>
  );
}
