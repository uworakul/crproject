"use client";

import { useState } from "react";
import Swal from "sweetalert2";

interface Tier {
  TenureTierID: number;
  MinYearsOfService: number;
  EntitledDays: string;
}

async function confirmDeleteTier(years: number): Promise<boolean> {
  const result = await Swal.fire({
    html: `ยืนยันการลบขั้นอายุงาน ${years} ปี?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

// Receives its own slice of tiers as a prop (pre-fetched by the Server
// Component, same convention as the rest of the app — no fetch-on-mount);
// refresh() after a mutation is an event-handler-triggered fetch, which is
// fine (it's the same pattern every other "add/edit/delete row" screen uses).
export default function LeaveTenureTierPanel({
  leaveTypeCode,
  initialTiers,
  canSave,
  canDelete,
}: {
  leaveTypeCode: string;
  initialTiers: Tier[];
  canSave: boolean;
  canDelete: boolean;
}) {
  const [tiers, setTiers] = useState(initialTiers);
  const [form, setForm] = useState({ minYearsOfService: "", entitledDays: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ minYearsOfService: "", entitledDays: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const sortedTiers = [...tiers].sort((a, b) => a.MinYearsOfService - b.MinYearsOfService);

  async function refresh() {
    const res = await fetch(`/api/leave/tenure-tiers?leaveTypeCode=${encodeURIComponent(leaveTypeCode)}`);
    if (res.ok) setTiers(await res.json());
  }

  async function handleCreate() {
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/leave/tenure-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveTypeCode, minYearsOfService: Number(form.minYearsOfService), entitledDays: Number(form.entitledDays) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      setForm({ minYearsOfService: "", entitledDays: "" });
      await refresh();
    } finally {
      setPending(false);
    }
  }

  function startEdit(t: Tier) {
    setEditingId(t.TenureTierID);
    setEditForm({ minYearsOfService: String(t.MinYearsOfService), entitledDays: t.EntitledDays });
  }

  async function saveEdit(id: number) {
    setMessage(null);
    const res = await fetch(`/api/leave/tenure-tiers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minYearsOfService: Number(editForm.minYearsOfService), entitledDays: Number(editForm.entitledDays) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    setEditingId(null);
    await refresh();
  }

  async function remove(t: Tier) {
    if (!(await confirmDeleteTier(t.MinYearsOfService))) return;
    setMessage(null);
    const res = await fetch(`/api/leave/tenure-tiers/${t.TenureTierID}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    await refresh();
  }

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
      <p className="mb-2 text-xs font-medium text-gray-500">ขั้นอายุงาน / สิทธิการลาพักร้อน — ตัวอย่าง: 1 ปี ได้ 6 วัน, 2 ปี ได้ 7 วัน</p>
      <table className="w-full max-w-md border-collapse text-sm">
        <thead className="border-b border-gray-200 text-left text-gray-500">
          <tr>
            <th className="py-1 pr-3 font-medium">อายุงาน (ปี)</th>
            <th className="py-1 pr-3 font-medium">สิทธิ (วัน)</th>
            {(canSave || canDelete) && <th className="py-1"></th>}
          </tr>
        </thead>
        <tbody>
          {sortedTiers.map((t) => {
            const isEditing = editingId === t.TenureTierID;
            return (
              <tr key={t.TenureTierID} className="border-t border-gray-100">
                <td className="py-1 pr-3">
                  {isEditing ? (
                    <input
                      type="number"
                      value={editForm.minYearsOfService}
                      onChange={(e) => setEditForm({ ...editForm, minYearsOfService: e.target.value })}
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  ) : (
                    t.MinYearsOfService
                  )}
                </td>
                <td className="py-1 pr-3">
                  {isEditing ? (
                    <input
                      type="number"
                      step="any"
                      value={editForm.entitledDays}
                      onChange={(e) => setEditForm({ ...editForm, entitledDays: e.target.value })}
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  ) : (
                    t.EntitledDays
                  )}
                </td>
                {(canSave || canDelete) && (
                  <td className="py-1 text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => saveEdit(t.TenureTierID)} className="text-gray-900 hover:underline">
                          บันทึก
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-gray-400 hover:underline">
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        {canSave && (
                          <button onClick={() => startEdit(t)} className="text-gray-500 hover:underline">
                            แก้ไข
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => remove(t)} className="text-red-500 hover:underline">
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
          {sortedTiers.length === 0 && (
            <tr>
              <td colSpan={3} className="py-3 text-center text-gray-400">
                ยังไม่มีขั้นอายุงาน
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canSave && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            อายุงาน (ปี)
            <input
              type="number"
              value={form.minYearsOfService}
              onChange={(e) => setForm({ ...form, minYearsOfService: e.target.value })}
              className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            สิทธิ (วัน)
            <input
              type="number"
              step="any"
              value={form.entitledDays}
              onChange={(e) => setForm({ ...form, entitledDays: e.target.value })}
              className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <button onClick={handleCreate} disabled={pending} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
            + เพิ่มขั้นอายุงาน
          </button>
        </div>
      )}
      {message && <p className="mt-1 text-sm text-red-600">{message}</p>}
    </div>
  );
}
