"use client";

import { useState } from "react";

interface LeaveType {
  LeaveTypeCode: string;
  LeaveTypeName: string;
  MaxDaysPerYear: number;
  RequireMedicalCert: boolean;
  BasedOnTenure: boolean;
}

type SortKey = "LeaveTypeCode" | "LeaveTypeName" | "MaxDaysPerYear";

function compareValues(key: SortKey, a: LeaveType, b: LeaveType) {
  if (key === "MaxDaysPerYear") return a.MaxDaysPerYear - b.MaxDaysPerYear;
  return a[key].localeCompare(b[key], "th");
}

export default function LeaveTypesView({ initialRows, canSave, canDelete }: { initialRows: LeaveType[]; canSave: boolean; canDelete: boolean }) {
  const [rows, setRows] = useState(initialRows);
  const [form, setForm] = useState({ leaveTypeCode: "", leaveTypeName: "", maxDaysPerYear: "", basedOnTenure: false });
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ leaveTypeName: "", maxDaysPerYear: "", basedOnTenure: false });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("LeaveTypeCode");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");

  const searchNorm = search.trim().toLowerCase();
  const filteredRows = searchNorm
    ? rows.filter((t) => t.LeaveTypeCode.toLowerCase().includes(searchNorm) || t.LeaveTypeName.toLowerCase().includes(searchNorm))
    : rows;

  const sortedRows = [...filteredRows].sort((a, b) => {
    const cmp = compareValues(sortKey, a, b);
    return sortDir === "asc" ? cmp : -cmp;
  });

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

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
      setForm({ leaveTypeCode: "", leaveTypeName: "", maxDaysPerYear: "", basedOnTenure: false });
      await refresh();
    } finally {
      setPending(false);
    }
  }

  function startEdit(t: LeaveType) {
    setEditingCode(t.LeaveTypeCode);
    setEditForm({ leaveTypeName: t.LeaveTypeName, maxDaysPerYear: String(t.MaxDaysPerYear), basedOnTenure: t.BasedOnTenure });
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
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ค้นหารหัสหรือชื่อประเภทการลา"
        className="w-64 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
      />
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              {(
                [
                  ["LeaveTypeCode", "รหัส"],
                  ["LeaveTypeName", "ชื่อประเภทการลา"],
                  ["MaxDaysPerYear", "สิทธิ/ปี (วัน)"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  className="cursor-pointer select-none px-3 py-2 font-medium hover:text-gray-900"
                >
                  {label}
                  {sortKey === key && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
                </th>
              ))}
              <th className="px-3 py-2 font-medium">ตามอายุงาน</th>
              {(canSave || canDelete) && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((t) => {
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
                        checked={editForm.basedOnTenure}
                        onChange={(e) => setEditForm({ ...editForm, basedOnTenure: e.target.checked })}
                      />
                    ) : t.BasedOnTenure ? (
                      "Yes"
                    ) : (
                      "No"
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
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                  {rows.length === 0 ? "ยังไม่มีข้อมูล" : "ไม่พบรายการที่ค้นหา"}
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
            <input type="checkbox" checked={form.basedOnTenure} onChange={(e) => setForm({ ...form, basedOnTenure: e.target.checked })} />
            ตามอายุงาน
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
