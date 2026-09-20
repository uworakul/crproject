import { redirect } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";

const MAX_ROWS = 300;

const ACTION_LABELS: Record<string, string> = {
  CREATE_EMPLOYEE: "เพิ่มพนักงาน",
  UPDATE_EMPLOYEE: "แก้ไขพนักงาน",
  DELETE_EMPLOYEE: "ลบพนักงาน",
  ADD_EMPLOYEE_HISTORY: "เพิ่ม Note พนักงาน",
  DELETE_EMPLOYEE_HISTORY: "ลบ Note พนักงาน",
  UPDATE_INSTALLMENT_DEDUCTION: "แก้ไขรายการหักต่องวด",
  DELETE_INSTALLMENT_DEDUCTION: "ลบรายการหักต่องวด",
};

function actionLabel(actionType: string): string {
  return ACTION_LABELS[actionType] ?? actionType;
}

function formatChanges(changesJson: string | null): { field: string; oldValue: string; newValue: string }[] {
  if (!changesJson) return [];
  try {
    const parsed = JSON.parse(changesJson) as Record<string, { old: unknown; new: unknown }>;
    return Object.entries(parsed).map(([field, { old, new: next }]) => ({
      field,
      oldValue: old === null || old === undefined ? "-" : String(old),
      newValue: next === null || next === undefined ? "-" : String(next),
    }));
  } catch {
    return [];
  }
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; userId?: string; empCode?: string }>;
}) {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "PROCESS_LOG", "read");
  if (!canRead) redirect("/");

  const { from, to, userId, empCode } = await searchParams;

  const where: {
    ActionDate?: { gte?: Date; lte?: Date };
    UserID?: string;
    TargetID?: string;
  } = {};
  if (from || to) {
    where.ActionDate = {};
    if (from) where.ActionDate.gte = new Date(`${from}T00:00:00`);
    if (to) where.ActionDate.lte = new Date(`${to}T23:59:59`);
  }
  if (userId) where.UserID = userId;
  if (empCode) where.TargetID = empCode;

  const [rowsRaw, users] = await Promise.all([
    prisma.sysProcessLog.findMany({
      where,
      include: { User: { select: { DisplayName: true } } },
      orderBy: { ActionDate: "desc" },
      take: MAX_ROWS,
    }),
    prisma.sysUser.findMany({ orderBy: { UserID: "asc" }, select: { UserID: true, DisplayName: true } }),
  ]);

  const rows = JSON.parse(JSON.stringify(rowsRaw, (_key, value) => (typeof value === "bigint" ? value.toString() : value))) as Array<{
    LogID: string;
    UserID: string;
    User: { DisplayName: string } | null;
    ActionType: string;
    TargetTable: string | null;
    TargetID: string | null;
    ActionDate: string;
    Detail: string | null;
    Changes: string | null;
  }>;

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">Audit Log</h1>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          จากวันที่
          <input type="date" name="from" defaultValue={from ?? ""} className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          ถึงวันที่
          <input type="date" name="to" defaultValue={to ?? ""} className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          ผู้ทำรายการ
          <select name="userId" defaultValue={userId ?? ""} className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900">
            <option value="">- ทุกคน -</option>
            {users.map((u) => (
              <option key={u.UserID} value={u.UserID}>
                {u.UserID} — {u.DisplayName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          รหัสพนักงาน
          <input
            type="text"
            name="empCode"
            defaultValue={empCode ?? ""}
            placeholder="เช่น 6909001"
            className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <button type="submit" className="rounded-md bg-gray-900 px-3.5 py-2 text-sm text-white hover:bg-gray-700">
          กรอง
        </button>
        <Link href="/audit-log" className="rounded-md border border-gray-300 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50">
          ล้างตัวกรอง
        </Link>
      </form>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">วันที่เวลา</th>
              <th className="px-3 py-2 font-medium">การกระทำ</th>
              <th className="px-3 py-2 font-medium">รหัสอ้างอิง</th>
              <th className="px-3 py-2 font-medium">ผู้ทำรายการ</th>
              <th className="px-3 py-2 font-medium">รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const changes = formatChanges(r.Changes);
              return (
                <tr key={r.LogID} className="border-t border-gray-100 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-500">{new Date(r.ActionDate).toLocaleString("th-TH")}</td>
                  <td className="px-3 py-2">{actionLabel(r.ActionType)}</td>
                  <td className="px-3 py-2 text-gray-500">{r.TargetID ?? "-"}</td>
                  <td className="px-3 py-2 text-gray-500">
                    {r.UserID}
                    {r.User ? ` — ${r.User.DisplayName}` : ""}
                  </td>
                  <td className="px-3 py-2">
                    {r.Detail && <div className="text-gray-700">{r.Detail}</div>}
                    {changes.length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-700">
                          ดูรายละเอียดที่เปลี่ยน ({changes.length})
                        </summary>
                        <ul className="mt-1 flex flex-col gap-0.5 text-xs text-gray-500">
                          {changes.map((c) => (
                            <li key={c.field}>
                              <span className="font-medium text-gray-600">{c.field}</span>: {c.oldValue} → {c.newValue}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {!r.Detail && changes.length === 0 && "-"}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                  ไม่พบรายการตามเงื่อนไขที่เลือก
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length === MAX_ROWS && (
        <p className="mt-2 text-xs text-gray-400">แสดงเฉพาะ {MAX_ROWS} รายการล่าสุด — ใช้ตัวกรองช่วงวันที่เพื่อดูรายการเก่ากว่านี้</p>
      )}
    </div>
  );
}
