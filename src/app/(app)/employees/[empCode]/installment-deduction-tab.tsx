"use client";

import { useState } from "react";

interface Debt {
  DebtID: number;
  DeductionCode: string | null;
  DeductionType: { DeductionCode: string; DeductionName: string } | null;
  Description: string | null;
  TotalAmount: string;
  PaidAmount: string;
  RemainingAmount: string;
  DeductPerPeriod: string | null;
  Status: string;
  MovementID: number | null;
}

function money(v: string) {
  return Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default function InstallmentDeductionTab({
  empCode,
  initialRows,
  deductionTypes,
  canSave,
}: {
  empCode: string;
  initialRows: Debt[];
  deductionTypes: { DeductionCode: string; DeductionName: string }[];
  canSave: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [form, setForm] = useState({ deductionCode: "", totalAmount: "", deductPerPeriod: "", description: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/employees/${empCode}/installment-deductions`);
    if (res.ok) setRows(await res.json());
  }

  async function handleAdd() {
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch(`/api/employees/${empCode}/installment-deductions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      setForm({ deductionCode: "", totalAmount: "", deductPerPeriod: "", description: "" });
      await refresh();
    } finally {
      setPending(false);
    }
  }

  async function toggleStatus(r: Debt) {
    setMessage(null);
    const res = await fetch(`/api/employees/${empCode}/installment-deductions/${r.DebtID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: r.Status === "OPEN" ? "CLOSED" : "OPEN" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setMessage(body.message || body.error);
    await refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">รายการหัก</th>
              <th className="px-3 py-2 font-medium">หมายเหตุ</th>
              <th className="px-3 py-2 font-medium text-right">ยอดเงินต้น</th>
              <th className="px-3 py-2 font-medium text-right">ยอดหักต่องวด</th>
              <th className="px-3 py-2 font-medium text-right">ยอดคงเหลือ</th>
              <th className="px-3 py-2 font-medium">สถานะ</th>
              {canSave && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.DebtID} className="border-t border-gray-100">
                <td className="px-3 py-2">{r.DeductionType?.DeductionName ?? (r.MovementID ? "เบิกเครื่องแบบ/สินค้า" : "-")}</td>
                <td className="px-3 py-2 text-gray-500">{r.Description ?? "-"}</td>
                <td className="px-3 py-2 text-right">{money(r.TotalAmount)}</td>
                <td className="px-3 py-2 text-right">{r.DeductPerPeriod ? money(r.DeductPerPeriod) : "-"}</td>
                <td className="px-3 py-2 text-right font-medium">{money(r.RemainingAmount)}</td>
                <td className="px-3 py-2">
                  {r.Status === "OPEN" ? <span className="text-amber-600">เปิด</span> : <span className="text-gray-400">ปิดแล้ว</span>}
                </td>
                {canSave && (
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button onClick={() => toggleStatus(r)} className="text-gray-500 hover:text-gray-900 hover:underline">
                      {r.Status === "OPEN" ? "ปิดรายการ" : "เปิดใหม่"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                  ยังไม่มีรายการหักต่องวด
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canSave && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 p-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            รายการหัก
            <select
              value={form.deductionCode}
              onChange={(e) => setForm({ ...form, deductionCode: e.target.value })}
              className="w-48 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            >
              <option value="">- เลือก -</option>
              {deductionTypes.map((d) => (
                <option key={d.DeductionCode} value={d.DeductionCode}>
                  {d.DeductionName}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            ยอดเงินต้น
            <input
              value={form.totalAmount}
              onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
              className="w-28 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            ยอดหักต่องวด
            <input
              value={form.deductPerPeriod}
              onChange={(e) => setForm({ ...form, deductPerPeriod: e.target.value })}
              className="w-28 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            หมายเหตุ
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-40 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <button
            onClick={handleAdd}
            disabled={pending || !form.deductionCode || !form.totalAmount}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            + เพิ่ม
          </button>
        </div>
      )}
      {deductionTypes.length === 0 && canSave && (
        <p className="text-sm text-gray-400">ยังไม่มีรายการหักที่ตั้งเป็น &quot;หักเป็นงวด&quot; — ตั้งค่าได้ที่ รายได้และรายการหัก</p>
      )}
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
