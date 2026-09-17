import { redirect } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { REQUEST_TYPE_VALUES, REQUEST_TYPE_DOCTYPE } from "@/lib/request";

const TYPE_LABELS: Record<string, string> = { ADVANCE: "เบิกล่วงหน้า", LOAN: "เงินกู้", TRAINING: "ค่าอบรม" };

export default async function DraftListPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "DRAFT_LIST", "read");
  if (!canRead) redirect("/");

  const visibleTypes = (
    await Promise.all(REQUEST_TYPE_VALUES.map(async (t) => ((await hasPermission(user, REQUEST_TYPE_DOCTYPE[t], "read")) ? t : null)))
  ).filter((t): t is (typeof REQUEST_TYPE_VALUES)[number] => t !== null);

  const rows = await prisma.trnRequest.findMany({
    where: { Status: "SUBMITTED", RequestType: { in: visibleTypes } },
    include: { Employee: { select: { FullName: true } } },
    orderBy: { SubmittedDate: "asc" },
  });

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">รายการรออนุมัติ</h1>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">ประเภท</th>
              <th className="px-3 py-2 font-medium">พนักงาน</th>
              <th className="px-3 py-2 font-medium text-right">ยอดเบิก (บาท)</th>
              <th className="px-3 py-2 font-medium">ส่งเมื่อ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.RequestID} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2">{TYPE_LABELS[r.RequestType] ?? r.RequestType}</td>
                <td className="px-3 py-2">
                  <Link href={`/requests/${r.RequestID}`} className="text-gray-900 hover:underline">
                    {r.Employee.FullName}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right">{Number(r.Amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-gray-500">{r.SubmittedDate ? new Date(r.SubmittedDate).toLocaleString("th-TH") : "-"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
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
