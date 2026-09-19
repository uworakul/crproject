import { redirect } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { REQUEST_DOCUMENT_CODE_VALUES, REQUEST_DOCUMENT_DOCTYPE, isValidRequestDocumentCode } from "@/lib/request";

function money(v: string | number) {
  return Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

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
    <div className="mx-auto max-w-4xl p-8">
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

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">รหัสเอกสาร</th>
              <th className="px-3 py-2 font-medium">เลขที่เอกสาร</th>
              <th className="px-3 py-2 font-medium">วันที่</th>
              <th className="px-3 py-2 font-medium text-right">จำนวนรายการ</th>
              <th className="px-3 py-2 font-medium text-right">ยอดเงินรวม</th>
              <th className="px-3 py-2 font-medium">ส่งเมื่อ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = r.Details.reduce((sum, d) => sum + Number(d.Amount), 0);
              return (
                <tr key={r.RequestHeaderID} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link href={`/requests/${r.RequestHeaderID}`} className="text-gray-900 hover:underline">
                      {r.DocumentCode}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{r.DocumentNo ?? "-"}</td>
                  <td className="px-3 py-2 text-gray-500">{new Date(r.RequestDate).toLocaleDateString("th-TH")}</td>
                  <td className="px-3 py-2 text-right">{r.Details.length}</td>
                  <td className="px-3 py-2 text-right">{money(total)}</td>
                  <td className="px-3 py-2 text-gray-500">{r.SubmittedDate ? new Date(r.SubmittedDate).toLocaleString("th-TH") : "-"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                  ไม่มีรายการรออนุมัติ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
