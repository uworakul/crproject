"use client";

import { Fragment, useState } from "react";
import Swal from "sweetalert2";
import { LEAVE_TENURE_COUNT_FROM_VALUES, LEAVE_TENURE_COUNT_FROM_LABELS } from "@/lib/leave";
import { EMPLOYEE_TYPE_VALUES, EMPLOYEE_TYPE_LABELS } from "@/lib/validation";
import LeaveTenureTierPanel from "./leave-tenure-tier-panel";

async function confirmDeleteType(code: string): Promise<boolean> {
  const result = await Swal.fire({
    html: `ยืนยันการลบประเภทการลา ${code}?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

interface LeaveType {
  LeaveTypeCode: string;
  LeaveTypeName: string;
  MaxDaysPerYear: number;
  RequireMedicalCert: boolean;
  BasedOnTenure: boolean;
  EligibleEmployeeType: string | null;
  TenureCountFrom: string | null;
}

interface TenureTier {
  TenureTierID: number;
  LeaveTypeCode: string;
  MinYearsOfService: number;
  EntitledDays: string;
}

type SortKey = "LeaveTypeCode" | "LeaveTypeName" | "MaxDaysPerYear";

function compareValues(key: SortKey, a: LeaveType, b: LeaveType) {
  if (key === "MaxDaysPerYear") return a.MaxDaysPerYear - b.MaxDaysPerYear;
  return a[key].localeCompare(b[key], "th");
}

function eligibilityLabel(code: string | null) {
  if (!code) return "ทุกคน";
  return EMPLOYEE_TYPE_LABELS[code as keyof typeof EMPLOYEE_TYPE_LABELS] ?? code;
}

const emptyForm = { leaveTypeCode: "", leaveTypeName: "", maxDaysPerYear: "", basedOnTenure: false, eligibleEmployeeType: "", tenureCountFrom: "" };

export default function LeaveTypesView({
  initialRows,
  initialTiers,
  canSave,
  canDelete,
}: {
  initialRows: LeaveType[];
  initialTiers: TenureTier[];
  canSave: boolean;
  canDelete: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  // Derived once from the prop, not state — each LeaveTenureTierPanel owns
  // its own refresh after mutations, so the parent never needs to update this.
  const tiersByType = new Map<string, TenureTier[]>();
  for (const t of initialTiers) tiersByType.set(t.LeaveTypeCode, [...(tiersByType.get(t.LeaveTypeCode) ?? []), t]);
  const [form, setForm] = useState(emptyForm);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
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

  function bodyFromForm(f: typeof form) {
    return {
      leaveTypeName: f.leaveTypeName,
      maxDaysPerYear: Number(f.maxDaysPerYear),
      basedOnTenure: f.basedOnTenure,
      eligibleEmployeeType: f.eligibleEmployeeType || undefined,
      tenureCountFrom: f.basedOnTenure ? f.tenureCountFrom : undefined,
    };
  }

  async function handleCreate() {
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/leave/types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveTypeCode: form.leaveTypeCode, ...bodyFromForm(form) }),
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

  function startEdit(t: LeaveType) {
    setEditingCode(t.LeaveTypeCode);
    setEditForm({
      leaveTypeCode: t.LeaveTypeCode,
      leaveTypeName: t.LeaveTypeName,
      maxDaysPerYear: String(t.MaxDaysPerYear),
      basedOnTenure: t.BasedOnTenure,
      eligibleEmployeeType: t.EligibleEmployeeType ?? "",
      tenureCountFrom: t.TenureCountFrom ?? "",
    });
  }

  async function saveEdit(code: string) {
    setMessage(null);
    const res = await fetch(`/api/leave/types/${code}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyFromForm(editForm)),
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
    if (!(await confirmDeleteType(code))) return;
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
                <th key={key} onClick={() => handleSort(key)} className="cursor-pointer select-none px-3 py-2 font-medium hover:text-gray-900">
                  {label}
                  {sortKey === key && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
                </th>
              ))}
              <th className="px-3 py-2 font-medium">สิทธิ์เฉพาะพนักงาน</th>
              <th className="px-3 py-2 font-medium">ตามอายุงาน</th>
              {(canSave || canDelete) && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((t) => {
              const isEditing = editingCode === t.LeaveTypeCode;
              const isExpanded = expandedCode === t.LeaveTypeCode;
              return (
                <Fragment key={t.LeaveTypeCode}>
                  <tr className="border-t border-gray-100 hover:bg-purple-50">
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
                          type="number"
                          step="any"
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
                        <select
                          value={editForm.eligibleEmployeeType}
                          onChange={(e) => setEditForm({ ...editForm, eligibleEmployeeType: e.target.value })}
                          className="rounded border border-gray-300 px-2 py-1 text-sm"
                        >
                          <option value="">ทุกคน</option>
                          {EMPLOYEE_TYPE_VALUES.map((v) => (
                            <option key={v} value={v}>
                              {EMPLOYEE_TYPE_LABELS[v]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        eligibilityLabel(t.EligibleEmployeeType)
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <div className="flex flex-col gap-1">
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={editForm.basedOnTenure}
                              onChange={(e) => setEditForm({ ...editForm, basedOnTenure: e.target.checked })}
                            />
                            ตามอายุงาน
                          </label>
                          {editForm.basedOnTenure && (
                            <select
                              value={editForm.tenureCountFrom}
                              onChange={(e) => setEditForm({ ...editForm, tenureCountFrom: e.target.value })}
                              className="rounded border border-gray-300 px-2 py-1 text-sm"
                            >
                              <option value="">-- นับอายุงานจาก --</option>
                              {LEAVE_TENURE_COUNT_FROM_VALUES.map((v) => (
                                <option key={v} value={v}>
                                  {LEAVE_TENURE_COUNT_FROM_LABELS[v]}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      ) : t.BasedOnTenure ? (
                        <div className="flex flex-col gap-0.5">
                          <span>Yes ({LEAVE_TENURE_COUNT_FROM_LABELS[t.TenureCountFrom as keyof typeof LEAVE_TENURE_COUNT_FROM_LABELS] ?? "-"})</span>
                          <button onClick={() => setExpandedCode(isExpanded ? null : t.LeaveTypeCode)} className="w-fit text-left text-gray-500 hover:underline">
                            {isExpanded ? "▾ ซ่อนขั้นอายุงาน" : "▸ จัดการขั้นอายุงาน"}
                          </button>
                        </div>
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
                  {isExpanded && t.BasedOnTenure && (
                    <tr className="border-t border-gray-100 bg-gray-50">
                      <td colSpan={6} className="px-3 py-3">
                        <LeaveTenureTierPanel
                          leaveTypeCode={t.LeaveTypeCode}
                          initialTiers={tiersByType.get(t.LeaveTypeCode) ?? []}
                          canSave={canSave}
                          canDelete={canDelete}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
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
              type="number"
              step="any"
              value={form.maxDaysPerYear}
              onChange={(e) => setForm({ ...form, maxDaysPerYear: e.target.value })}
              className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            สิทธิ์เฉพาะพนักงาน
            <select
              value={form.eligibleEmployeeType}
              onChange={(e) => setForm({ ...form, eligibleEmployeeType: e.target.value })}
              className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            >
              <option value="">ทุกคน</option>
              {EMPLOYEE_TYPE_VALUES.map((v) => (
                <option key={v} value={v}>
                  {EMPLOYEE_TYPE_LABELS[v]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 pb-1.5 text-xs text-gray-500">
            <input type="checkbox" checked={form.basedOnTenure} onChange={(e) => setForm({ ...form, basedOnTenure: e.target.checked })} />
            ตามอายุงาน
          </label>
          {form.basedOnTenure && (
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              นับอายุงานจาก
              <select
                value={form.tenureCountFrom}
                onChange={(e) => setForm({ ...form, tenureCountFrom: e.target.value })}
                className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
              >
                <option value="">-- เลือก --</option>
                {LEAVE_TENURE_COUNT_FROM_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {LEAVE_TENURE_COUNT_FROM_LABELS[v]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button onClick={handleCreate} disabled={pending} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
            + เพิ่มประเภทการลา
          </button>
        </div>
      )}
      <p className="text-xs text-gray-400">
        เพิ่มขั้นอายุงานได้หลังบันทึกประเภทการลาที่ติ๊ก &quot;ตามอายุงาน&quot; แล้ว — คลิก &quot;จัดการขั้นอายุงาน&quot; ที่แถวนั้น
      </p>
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
