"use client";

import { useState } from "react";
import Swal from "sweetalert2";

async function confirmDeleteRow(): Promise<boolean> {
  const result = await Swal.fire({
    html: "ยืนยันการลบประวัติการฝึกอบรมรายการนี้?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

interface TrainingExperience {
  TrainingExperienceID: number;
  Organization: string;
  Location: string | null;
  Duration: string | null;
  Topic: string | null;
  StartDate: string | null;
  EndDate: string | null;
  CertificateNo: string | null;
}

const emptyForm = { organization: "", location: "", duration: "", topic: "", startDate: "", endDate: "", certificateNo: "" };

function toDateInputValue(value: string | null): string {
  if (!value) return "";
  return value.length >= 10 ? value.slice(0, 10) : value;
}

function displayDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("th-TH") : "-";
}

export default function TrainingExperienceTab({
  empCode,
  initialRows,
  canSave,
}: {
  empCode: string;
  initialRows: TrainingExperience[];
  canSave: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/employees/${empCode}/training-experience`);
    if (res.ok) setRows(await res.json());
  }

  async function handleAdd() {
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch(`/api/employees/${empCode}/training-experience`, {
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

  function startEdit(r: TrainingExperience) {
    setEditingId(r.TrainingExperienceID);
    setEditForm({
      organization: r.Organization,
      location: r.Location ?? "",
      duration: r.Duration ?? "",
      topic: r.Topic ?? "",
      startDate: toDateInputValue(r.StartDate),
      endDate: toDateInputValue(r.EndDate),
      certificateNo: r.CertificateNo ?? "",
    });
  }

  async function saveEdit(id: number) {
    setMessage(null);
    const res = await fetch(`/api/employees/${empCode}/training-experience/${id}`, {
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
    const res = await fetch(`/api/employees/${empCode}/training-experience/${id}`, { method: "DELETE" });
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
              <th className="px-3 py-2 font-medium">หน่วยงาน</th>
              <th className="px-3 py-2 font-medium">สถานที่</th>
              <th className="px-3 py-2 font-medium">ระยะเวลา</th>
              <th className="px-3 py-2 font-medium">หัวข้ออบรม</th>
              <th className="px-3 py-2 font-medium">วันที่เริ่มต้น</th>
              <th className="px-3 py-2 font-medium">วันที่สิ้นสุด</th>
              <th className="px-3 py-2 font-medium">เลขที่ใบรับรอง</th>
              {canSave && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isEditing = editingId === r.TrainingExperienceID;
              return (
                <tr key={r.TrainingExperienceID} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        value={editForm.organization}
                        onChange={(e) => setEditForm({ ...editForm, organization: e.target.value })}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      r.Organization
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
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        value={editForm.duration}
                        onChange={(e) => setEditForm({ ...editForm, duration: e.target.value })}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      (r.Duration ?? "-")
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        value={editForm.topic}
                        onChange={(e) => setEditForm({ ...editForm, topic: e.target.value })}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      (r.Topic ?? "-")
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
                        value={editForm.certificateNo}
                        onChange={(e) => setEditForm({ ...editForm, certificateNo: e.target.value })}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      (r.CertificateNo ?? "-")
                    )}
                  </td>
                  {canSave && (
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => saveEdit(r.TrainingExperienceID)} className="text-gray-900 hover:underline">
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
                          <button onClick={() => remove(r.TrainingExperienceID)} className="text-red-500 hover:underline">
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
                <td colSpan={8} className="px-3 py-6 text-center text-gray-400">
                  ยังไม่มีข้อมูล
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canSave && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 p-3">
          <Field label="หน่วยงาน">
            <input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} className="w-40 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
          </Field>
          <Field label="สถานที่">
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-32 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
          </Field>
          <Field label="ระยะเวลา">
            <input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} className="w-24 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
          </Field>
          <Field label="หัวข้ออบรม">
            <input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} className="w-40 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
          </Field>
          <Field label="วันที่เริ่มต้น">
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
          </Field>
          <Field label="วันที่สิ้นสุด">
            <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
          </Field>
          <Field label="เลขที่ใบรับรอง">
            <input value={form.certificateNo} onChange={(e) => setForm({ ...form, certificateNo: e.target.value })} className="w-32 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
          </Field>
          <button
            onClick={handleAdd}
            disabled={pending || !form.organization.trim()}
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
