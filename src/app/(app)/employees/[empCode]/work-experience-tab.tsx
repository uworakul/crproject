"use client";

import { useState } from "react";
import Swal from "sweetalert2";

async function confirmDeleteRow(): Promise<boolean> {
  const result = await Swal.fire({
    html: "ยืนยันการลบประวัติการทำงานรายการนี้?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

interface WorkExperience {
  WorkExperienceID: number;
  CompanyName: string;
  PositionName: string | null;
  Location: string | null;
  Responsibility: string | null;
  StartDate: string | null;
  EndDate: string | null;
  ResignReason: string | null;
}

const emptyForm = { companyName: "", positionName: "", location: "", responsibility: "", startDate: "", endDate: "", resignReason: "" };

function toDateInputValue(value: string | null): string {
  if (!value) return "";
  return value.length >= 10 ? value.slice(0, 10) : value;
}

function displayDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("th-TH") : "-";
}

export default function WorkExperienceTab({ empCode, initialRows, canSave }: { empCode: string; initialRows: WorkExperience[]; canSave: boolean }) {
  const [rows, setRows] = useState(initialRows);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/employees/${empCode}/work-experience`);
    if (res.ok) setRows(await res.json());
  }

  async function handleAdd() {
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch(`/api/employees/${empCode}/work-experience`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      setForm(emptyForm);
      await refresh();
    } finally {
      setPending(false);
    }
  }

  function startEdit(r: WorkExperience) {
    setEditingId(r.WorkExperienceID);
    setEditForm({
      companyName: r.CompanyName,
      positionName: r.PositionName ?? "",
      location: r.Location ?? "",
      responsibility: r.Responsibility ?? "",
      startDate: toDateInputValue(r.StartDate),
      endDate: toDateInputValue(r.EndDate),
      resignReason: r.ResignReason ?? "",
    });
  }

  async function saveEdit(id: number) {
    setMessage(null);
    const res = await fetch(`/api/employees/${empCode}/work-experience/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    setEditingId(null);
    await refresh();
  }

  async function remove(id: number) {
    if (!(await confirmDeleteRow())) return;
    setMessage(null);
    const res = await fetch(`/api/employees/${empCode}/work-experience/${id}`, { method: "DELETE" });
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
              <th className="px-3 py-2 font-medium">บริษัท</th>
              <th className="px-3 py-2 font-medium">ตำแหน่ง</th>
              <th className="px-3 py-2 font-medium">สถานที่</th>
              <th className="px-3 py-2 font-medium">วันที่เริ่มต้น</th>
              <th className="px-3 py-2 font-medium">วันที่สิ้นสุด</th>
              <th className="px-3 py-2 font-medium">สาเหตุการลาออก</th>
              {canSave && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isEditing = editingId === r.WorkExperienceID;
              return (
                <tr key={r.WorkExperienceID} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        value={editForm.companyName}
                        onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      r.CompanyName
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        value={editForm.positionName}
                        onChange={(e) => setEditForm({ ...editForm, positionName: e.target.value })}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      (r.PositionName ?? "-")
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        value={editForm.location}
                        onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      (r.Location ?? "-")
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {isEditing ? (
                      <input
                        type="date"
                        value={editForm.startDate}
                        onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      displayDate(r.StartDate)
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {isEditing ? (
                      <input
                        type="date"
                        value={editForm.endDate}
                        onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      displayDate(r.EndDate)
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        value={editForm.resignReason}
                        onChange={(e) => setEditForm({ ...editForm, resignReason: e.target.value })}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      (r.ResignReason ?? "-")
                    )}
                  </td>
                  {canSave && (
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => saveEdit(r.WorkExperienceID)} className="text-gray-900 hover:underline">
                            บันทึก
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-gray-400 hover:underline">
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => startEdit(r)} className="text-gray-500 hover:text-gray-900 hover:underline">
                            แก้ไข
                          </button>
                          <button onClick={() => remove(r.WorkExperienceID)} className="text-red-500 hover:underline">
                            ลบ
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                  ยังไม่มีข้อมูล
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canSave && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 p-3">
          <Field label="บริษัท">
            <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="w-40 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
          </Field>
          <Field label="ตำแหน่ง">
            <input value={form.positionName} onChange={(e) => setForm({ ...form, positionName: e.target.value })} className="w-32 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
          </Field>
          <Field label="สถานที่">
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-32 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
          </Field>
          <Field label="วันที่เริ่มต้น">
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
          </Field>
          <Field label="วันที่สิ้นสุด">
            <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
          </Field>
          <Field label="สาเหตุการลาออก">
            <input value={form.resignReason} onChange={(e) => setForm({ ...form, resignReason: e.target.value })} className="w-40 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
          </Field>
          <button
            onClick={handleAdd}
            disabled={pending || !form.companyName.trim()}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            + เพิ่ม
          </button>
        </div>
      )}
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-gray-500">
      {label}
      {children}
    </label>
  );
}
