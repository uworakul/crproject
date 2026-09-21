"use client";

import { useState } from "react";
import Swal from "sweetalert2";
import { RATE_BASIS_VALUES, RATE_BASIS_LABELS } from "@/lib/site";
import SearchableSelect from "../../../searchable-select";

interface IncomeRow {
  PositionIncomeID: number;
  IncomeCode: string;
  IncomeType: { IncomeName: string };
  Amount: string;
  RateBasis: string;
}

async function confirmDeleteIncome(name: string): Promise<boolean> {
  const result = await Swal.fire({
    html: `ยืนยันการลบรายได้ "${name}"?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

// "รายได้พื้นฐาน" ต่อตำแหน่ง (2026-09-21) — เกือบเหมือน SitePositionIncomePanel
// เป๊ะๆ แค่ไม่มีมิติหน่วยงาน (คีย์ด้วย PositionCode ตรงๆ แทน SitePositionID)
export default function PositionIncomePanel({
  positionCode,
  initialIncomes,
  incomeTypes,
  canSave,
  canDelete,
}: {
  positionCode: string;
  initialIncomes: IncomeRow[];
  incomeTypes: { IncomeCode: string; IncomeName: string }[];
  canSave: boolean;
  canDelete: boolean;
}) {
  const [rows, setRows] = useState(initialIncomes);
  const [form, setForm] = useState({ incomeCode: "", amount: "", rateBasis: "DAILY" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ amount: "", rateBasis: "DAILY" });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const usedCodes = new Set(rows.map((r) => r.IncomeCode));
  const availableTypes = incomeTypes.filter((t) => !usedCodes.has(t.IncomeCode));

  async function refresh() {
    const res = await fetch(`/api/position-incomes?positionCode=${encodeURIComponent(positionCode)}`);
    if (res.ok) setRows(await res.json());
  }

  async function handleCreate() {
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/position-incomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionCode, incomeCode: form.incomeCode, amount: Number(form.amount), rateBasis: form.rateBasis }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      setForm({ incomeCode: "", amount: "", rateBasis: "DAILY" });
      await refresh();
    } finally {
      setPending(false);
    }
  }

  function startEdit(r: IncomeRow) {
    setEditingId(r.PositionIncomeID);
    setEditForm({ amount: r.Amount, rateBasis: r.RateBasis });
  }

  async function saveEdit(id: number) {
    setMessage(null);
    const res = await fetch(`/api/position-incomes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(editForm.amount), rateBasis: editForm.rateBasis }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    setEditingId(null);
    await refresh();
  }

  async function remove(r: IncomeRow) {
    if (!(await confirmDeleteIncome(r.IncomeType.IncomeName))) return;
    setMessage(null);
    const res = await fetch(`/api/position-incomes/${r.PositionIncomeID}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    await refresh();
  }

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
      <p className="mb-2 text-xs font-medium text-gray-500">
        รายได้พื้นฐานของตำแหน่งนี้ — ใช้แทนเมื่อพนักงาน/หน่วยงานไม่ได้กำหนดอัตราของประเภทนี้ไว้เอง
      </p>
      <table className="w-full border-collapse text-sm">
        <thead className="border-b border-gray-200 text-left text-gray-500">
          <tr>
            <th className="py-1 pr-3 font-medium">ประเภทรายได้</th>
            <th className="py-1 pr-3 font-medium text-right">จำนวนเงิน</th>
            <th className="py-1 pr-3 font-medium">หน่วย</th>
            {(canSave || canDelete) && <th className="py-1"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isEditing = editingId === r.PositionIncomeID;
            return (
              <tr key={r.PositionIncomeID} className="border-t border-gray-100">
                <td className="py-1 pr-3">{r.IncomeType.IncomeName}</td>
                <td className="py-1 pr-3 text-right">
                  {isEditing ? (
                    <input
                      type="number"
                      step="any"
                      value={editForm.amount}
                      onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                      className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                    />
                  ) : (
                    Number(r.Amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })
                  )}
                </td>
                <td className="py-1 pr-3">
                  {isEditing ? (
                    <select
                      value={editForm.rateBasis}
                      onChange={(e) => setEditForm({ ...editForm, rateBasis: e.target.value })}
                      className="rounded border border-gray-300 px-2 py-1 text-sm"
                    >
                      {RATE_BASIS_VALUES.map((v) => (
                        <option key={v} value={v}>
                          {RATE_BASIS_LABELS[v]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    (RATE_BASIS_LABELS[r.RateBasis as keyof typeof RATE_BASIS_LABELS] ?? r.RateBasis)
                  )}
                </td>
                {(canSave || canDelete) && (
                  <td className="py-1 text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => saveEdit(r.PositionIncomeID)} className="text-gray-900 hover:underline">
                          บันทึก
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-gray-400 hover:underline">
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        {canSave && (
                          <button onClick={() => startEdit(r)} className="text-gray-500 hover:underline">
                            แก้ไข
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => remove(r)} className="text-red-500 hover:underline">
                            ลบ
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="py-3 text-center text-gray-400">
                ยังไม่มีรายได้พื้นฐานกำหนดไว้
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canSave && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            ประเภทรายได้
            <div className="w-72">
              <SearchableSelect
                value={form.incomeCode}
                onChange={(code) => setForm({ ...form, incomeCode: code })}
                options={availableTypes.map((t) => ({ code: t.IncomeCode, label: t.IncomeName }))}
                placeholder="เลือกประเภทรายได้"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            จำนวนเงิน
            <input
              type="number"
              step="any"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-28 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            หน่วย
            <select
              value={form.rateBasis}
              onChange={(e) => setForm({ ...form, rateBasis: e.target.value })}
              className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            >
              {RATE_BASIS_VALUES.map((v) => (
                <option key={v} value={v}>
                  {RATE_BASIS_LABELS[v]}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={handleCreate}
            disabled={pending || !form.incomeCode}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            + เพิ่มรายได้
          </button>
        </div>
      )}
      {message && <p className="mt-1 text-sm text-red-600">{message}</p>}
    </div>
  );
}
