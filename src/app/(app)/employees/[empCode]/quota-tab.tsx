"use client";

import { useState } from "react";
import { QUOTA_TYPE_VALUES, QUOTA_TYPE_LABELS, type QuotaType } from "@/lib/validation";

interface QuotaRow {
  QuotaID: number;
  QuotaType: string;
  QuotaLimit: string;
  QuotaUsed: string;
  QuotaRemaining: string;
}

export default function QuotaTab({ empCode, initialQuota, canSave }: { empCode: string; initialQuota: QuotaRow[]; canSave: boolean }) {
  const [quota, setQuota] = useState(initialQuota);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const byType = new Map(quota.map((q) => [q.QuotaType, q]));

  async function save() {
    setMessage(null);
    setPending(true);
    try {
      const payload = QUOTA_TYPE_VALUES.map((t) => ({
        quotaType: t,
        quotaLimit: edits[t] !== undefined ? edits[t] : (byType.get(t)?.QuotaLimit ?? "0"),
      }));
      const res = await fetch(`/api/employees/${empCode}/quota`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      setQuota(body);
      setEdits({});
      setMessage("บันทึกแล้ว");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <table className="w-full border-collapse overflow-hidden rounded-lg border border-gray-200 bg-white text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-3 py-2 font-medium">ประเภท</th>
            <th className="px-3 py-2 font-medium">วงเงิน (บาท)</th>
            <th className="px-3 py-2 font-medium">ใช้ไปแล้ว</th>
            <th className="px-3 py-2 font-medium">คงเหลือ</th>
          </tr>
        </thead>
        <tbody>
          {QUOTA_TYPE_VALUES.map((t: QuotaType) => {
            const row = byType.get(t);
            return (
              <tr key={t} className="border-t border-gray-100">
                <td className="px-3 py-2">{QUOTA_TYPE_LABELS[t]}</td>
                <td className="px-3 py-2">
                  {canSave ? (
                    <input
                      type="number"
                      step="any"
                      value={edits[t] ?? row?.QuotaLimit ?? "0"}
                      onChange={(e) => setEdits({ ...edits, [t]: e.target.value })}
                      className="w-28 rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  ) : (
                    Number(row?.QuotaLimit ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })
                  )}
                </td>
                <td className="px-3 py-2 text-gray-500">{Number(row?.QuotaUsed ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-gray-500">
                  {Number(row?.QuotaRemaining ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {canSave && (
        <button
          onClick={save}
          disabled={pending}
          className="w-fit rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก..." : "บันทึกวงเงิน"}
        </button>
      )}
      {message && <p className="text-sm text-gray-600">{message}</p>}
    </div>
  );
}
