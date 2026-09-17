"use client";

import { useState } from "react";

interface LeaveType {
  LeaveTypeCode: string;
  LeaveTypeName: string;
  MaxDaysPerYear: number;
  RequireMedicalCert: boolean;
}

export default function LeaveTypesView({ initialRows, canSave, canDelete }: { initialRows: LeaveType[]; canSave: boolean; canDelete: boolean }) {
  const [rows, setRows] = useState(initialRows);
  const [form, setForm] = useState({ leaveTypeCode: "", leaveTypeName: "", maxDaysPerYear: "", requireMedicalCert: false });
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ leaveTypeName: "", maxDaysPerYear: "", requireMedicalCert: false });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function refresh() {
    const res = await fetch("/api/leave/types");
    if (res.ok) setRows(await res.json());
  }

  async function handleCreate() {
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/leave/types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, maxDaysPerYear: Number(form.maxDaysPerYear) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      setForm({ leaveTypeCode: "", leaveTypeName: "", maxDaysPerYear: "", requireMedicalCert: false });
      await refresh();
    } finally {
      setPending(false);
    }
  }

  function startEdit(t: LeaveType) {
    setEditingCode(t.LeaveTypeCode);
    setEditForm({ leaveTypeName: t.LeaveTypeName, maxDaysPerYear: String(t.MaxDaysPerYear), requireMedicalCert: t.RequireMedicalCert });
  }

  async function saveEdit(code: string) {
    setMessage(null);
    const res = await fetch(`/api/leave/types/${code}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editForm, maxDaysPerYear: Number(editForm.maxDaysPerYear) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    setEditingCode(null);
    await refresh();
  }

  async function remove(code: string) {
    setMessage(null);
    const res = await fetch(`/api/leave/types/${code}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    await refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">รหัส</th>
              <th className="px-3 py-2 font-medium">ชื่อประเภทการลา</th>
              <th className="px-3 py-2 font-medium">สิทธิ/ปี (วัน)</th>
              <th className="px-3 py-2 font-medium">ต้องมีใบรับรองแพทย์</th>
              {(canSave || canDelete) && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const isEditing = editingCode === t.LeaveTypeCode;
              return (
                <tr key={t.LeaveTypeCode} className="border-t border-gray-100">
                  <td className="px-3 py-2">{t.LeaveTypeCode}</td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        value={editForm.leaveTypeName}
                        onChange={(e) => setEditForm({ ...editForm, leaveTypeName: e.target.value })}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      t.LeaveTypeName
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        value={editForm.maxDaysPerYear}
                        onChange={(e) => setEditForm({ ...editForm, maxDaysPerYear: e.target.value })}
                        className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      t.MaxDaysPerYear
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        type="checkbox"
                        checked={editForm.requireMedicalCert}
                        onChange={(e) => setEditForm({ ...editForm, requireMedicalCert: e.target.checked })}
                      />
                    ) : t.RequireMedicalCert ? (
                      "ใช่"
                    ) : (
                      "ไม่"
                    )}
                  </td>
                  {(canSave || canDelete) && (
                    <td className="px-3 py-2 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => saveEdit(t.LeaveTypeCode)} className="text-gray-900 hover:underline">
                            บันทึก
                          </button>
                          <button onClick={() => setEditingCode(null)} className="text-gray-400 hover:underline">
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
                            <button onClick={() => remove(t.LeaveTypeCode)} className="text-red-500 hover:underline">
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
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                  ยังไม่มีข้อมูล
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canSave && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 p-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            รหัส
            <input
              value={form.leaveTypeCode}
              onChange={(e) => setForm({ ...form, leaveTypeCode: e.target.value })}
              className="w-24 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            ชื่อประเภทการลา
            <input
              value={form.leaveTypeName}
              onChange={(e) => setForm({ ...form, leaveTypeName: e.target.value })}
              className="w-48 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            สิทธิ/ปี (วัน)
            <input
              value={form.maxDaysPerYear}
              onChange={(e) => setForm({ ...form, maxDaysPerYear: e.target.value })}
              className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex items-center gap-1 pb-1.5 text-xs text-gray-500">
            <input type="checkbox" checked={form.requireMedicalCert} onChange={(e) => setForm({ ...form, requireMedicalCert: e.target.checked })} />
            ต้องมีใบรับรองแพทย์
          </label>
          <button
            onClick={handleCreate}
            disabled={pending}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            + เพิ่มประเภทการลา
          </button>
        </div>
      )}
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
