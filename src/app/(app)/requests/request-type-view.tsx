"use client";

import { useState } from "react";
import Link from "next/link";
import type { RequestType } from "@/lib/request";

interface RequestRow {
  RequestID: number;
  EmpCode: string;
  Employee: { FullName: string };
  Amount: string;
  DeductPerPeriod: string;
  Status: string;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "แบบร่าง",
  SUBMITTED: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ตีกลับ",
};

export default function RequestTypeView({
  type,
  initialRows,
  canSave,
}: {
  type: RequestType;
  initialRows: RequestRow[];
  canSave: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [form, setForm] = useState({ empCode: "", amount: "", deductPerPeriod: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/requests?type=${type}`);
    if (res.ok) setRows(await res.json());
  }

  async function handleCreate() {
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestType: type, ...form }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      setForm({ empCode: "", amount: "", deductPerPeriod: "" });
      await refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">พนักงาน</th>
              <th className="px-3 py-2 font-medium text-right">ยอดเบิก (บาท)</th>
              <th className="px-3 py-2 font-medium text-right">หักต่องวด (บาท)</th>
              <th className="px-3 py-2 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.RequestID} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2">
                  <Link href={`/requests/${r.RequestID}`} className="text-gray-900 hover:underline">
                    {r.Employee.FullName}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right">{Number(r.Amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right">{Number(r.DeductPerPeriod).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2">{STATUS_LABEL[r.Status] ?? r.Status}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
                  ยังไม่มีรายการ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canSave && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 p-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            รหัสพนักงาน
            <input
              value={form.empCode}
              onChange={(e) => setForm({ ...form, empCode: e.target.value })}
              className="w-32 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            ยอดเบิก (บาท)
            <input
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-28 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            หักต่องวด (บาท)
            <input
              value={form.deductPerPeriod}
              onChange={(e) => setForm({ ...form, deductPerPeriod: e.target.value })}
              className="w-28 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <button
            onClick={handleCreate}
            disabled={pending}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            + สร้างคำขอ
          </button>
        </div>
      )}
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
