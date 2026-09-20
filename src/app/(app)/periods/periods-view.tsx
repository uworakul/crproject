"use client";

import { useState } from "react";
import Swal from "sweetalert2";
import { EMPLOYEE_TYPE_VALUES, EMPLOYEE_TYPE_LABELS, type EmployeeType } from "@/lib/validation";
import { toBuddhistYear, toGregorianYear } from "@/lib/buddhist-year";

async function confirmDeletePeriod(label: string): Promise<boolean> {
  const result = await Swal.fire({
    html: `ยืนยันการลบงวด ${label}?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

interface Period {
  PeriodID: number;
  EmployeeType: string;
  PeriodYear: number;
  PeriodMonth: number;
  StartDate: string;
  EndDate: string;
  PayDate: string;
  Status: string;
  IsCurrent: boolean;
}

export default function PeriodsView({ initialPeriods, canSave, canDelete }: { initialPeriods: Period[]; canSave: boolean; canDelete: boolean }) {
  const [periods, setPeriods] = useState(initialPeriods);
  const [form, setForm] = useState({
    employeeType: "" as string,
    periodYear: "",
    periodMonth: "",
    startDate: "",
    endDate: "",
    payDate: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ periodYear: "", periodMonth: "", startDate: "", endDate: "", payDate: "", isCurrent: false });
  const now = new Date();
  const [filterType, setFilterType] = useState("");
  const [filterYear, setFilterYear] = useState(String(now.getFullYear()));
  const [filterMonth, setFilterMonth] = useState(String(now.getMonth() + 1));

  function toDateInputValue(value: string) {
    return value.length >= 10 ? value.slice(0, 10) : value;
  }

  const yearOptions = [...new Set([...periods.map((p) => p.PeriodYear), now.getFullYear()])].sort((a, b) => b - a);
  const filteredPeriods = periods.filter(
    (p) =>
      (!filterType || p.EmployeeType === filterType) &&
      (!filterYear || String(p.PeriodYear) === filterYear) &&
      (!filterMonth || String(p.PeriodMonth) === filterMonth),
  );

  async function refresh() {
    const res = await fetch("/api/periods");
    if (res.ok) setPeriods(await res.json());
  }

  async function handleCreate() {
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, periodYear: toGregorianYear(Number(form.periodYear)) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      setForm({ employeeType: "", periodYear: "", periodMonth: "", startDate: "", endDate: "", payDate: "" });
      await refresh();
    } finally {
      setPending(false);
    }
  }

  function handleEndDateChange(value: string) {
    if (!value) {
      setForm({ ...form, endDate: value });
      return;
    }
    const [y, m] = value.split("-").map(Number);
    setForm({ ...form, endDate: value, periodYear: String(toBuddhistYear(y)), periodMonth: String(m) });
  }

  async function remove(p: Period) {
    if (!(await confirmDeletePeriod(`${p.PeriodMonth}/${toBuddhistYear(p.PeriodYear)}`))) return;
    setMessage(null);
    const res = await fetch(`/api/periods/${p.PeriodID}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    await refresh();
  }

  function startEdit(p: Period) {
    setEditingId(p.PeriodID);
    setEditForm({
      periodYear: String(toBuddhistYear(p.PeriodYear)),
      periodMonth: String(p.PeriodMonth),
      startDate: toDateInputValue(p.StartDate),
      endDate: toDateInputValue(p.EndDate),
      payDate: toDateInputValue(p.PayDate),
      isCurrent: p.IsCurrent,
    });
  }

  function handleEditEndDateChange(value: string) {
    if (!value) {
      setEditForm({ ...editForm, endDate: value });
      return;
    }
    const [y, m] = value.split("-").map(Number);
    setEditForm({ ...editForm, endDate: value, periodYear: String(toBuddhistYear(y)), periodMonth: String(m) });
  }

  async function saveEdit(id: number) {
    setMessage(null);
    const res = await fetch(`/api/periods/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editForm, periodYear: toGregorianYear(Number(editForm.periodYear)) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    setEditingId(null);
    await refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          ประเภทพนักงาน
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
          >
            <option value="">ทั้งหมด</option>
            {EMPLOYEE_TYPE_VALUES.map((t) => (
              <option key={t} value={t}>
                {EMPLOYEE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          ปี พ.ศ.
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
          >
            <option value="">ทั้งหมด</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {toBuddhistYear(y)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          เดือน
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
          >
            <option value="">ทั้งหมด</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">ประเภทพนักงาน</th>
              <th className="px-3 py-2 font-medium">งวด</th>
              <th className="px-3 py-2 font-medium">วันเริ่ม</th>
              <th className="px-3 py-2 font-medium">วันสิ้นสุด</th>
              <th className="px-3 py-2 font-medium">วันจ่าย</th>
              <th className="px-3 py-2 font-medium">งวดปัจจุบัน</th>
              {(canSave || canDelete) && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {filteredPeriods.map((p) => {
              const isEditing = editingId === p.PeriodID;
              return (
                <tr key={p.PeriodID} className="border-t border-gray-100 hover:bg-purple-50">
                  <td className="px-3 py-2 text-gray-500">{p.PeriodID}</td>
                  <td className="px-3 py-2">{EMPLOYEE_TYPE_LABELS[p.EmployeeType as EmployeeType] ?? p.EmployeeType}</td>
                  <td className="px-3 py-2">
                    {isEditing ? `${editForm.periodMonth}/${editForm.periodYear}` : `${p.PeriodMonth}/${toBuddhistYear(p.PeriodYear)}`}
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {isEditing ? (
                      <input
                        type="date"
                        value={editForm.startDate}
                        onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                        className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                      />
                    ) : (
                      new Date(p.StartDate).toLocaleDateString("th-TH")
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {isEditing ? (
                      <input
                        type="date"
                        value={editForm.endDate}
                        onChange={(e) => handleEditEndDateChange(e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                      />
                    ) : (
                      new Date(p.EndDate).toLocaleDateString("th-TH")
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {isEditing ? (
                      <input
                        type="date"
                        value={editForm.payDate}
                        onChange={(e) => setEditForm({ ...editForm, payDate: e.target.value })}
                        className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                      />
                    ) : (
                      new Date(p.PayDate).toLocaleDateString("th-TH")
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        type="checkbox"
                        checked={editForm.isCurrent}
                        onChange={(e) => setEditForm({ ...editForm, isCurrent: e.target.checked })}
                      />
                    ) : p.IsCurrent ? (
                      <span className="text-green-600">✓ งวดปัจจุบัน</span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  {(canSave || canDelete) && (
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => saveEdit(p.PeriodID)} className="text-gray-900 hover:underline">
                            บันทึก
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-gray-400 hover:underline">
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          {canSave && (
                            <button onClick={() => startEdit(p)} className="text-gray-500 hover:text-gray-900 hover:underline">
                              แก้ไข
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => remove(p)} className="text-red-500 hover:underline">
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
            {filteredPeriods.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-400">
                  {periods.length === 0 ? "ยังไม่มีงวด" : "ไม่พบงวดตามเงื่อนไขที่กรอง"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canSave && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 p-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            ประเภทพนักงาน
            <select
              value={form.employeeType}
              onChange={(e) => setForm({ ...form, employeeType: e.target.value })}
              className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            >
              <option value="">เลือก</option>
              {EMPLOYEE_TYPE_VALUES.map((t) => (
                <option key={t} value={t}>
                  {EMPLOYEE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            ปี พ.ศ.
            <input
              type="number"
              value={form.periodYear}
              onChange={(e) => setForm({ ...form, periodYear: e.target.value })}
              className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            เดือน (1-12)
            <input
              type="number"
              min="1"
              max="12"
              value={form.periodMonth}
              onChange={(e) => setForm({ ...form, periodMonth: e.target.value })}
              className="w-16 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            วันเริ่ม
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            วันสิ้นสุด
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            วันจ่าย
            <input
              type="date"
              value={form.payDate}
              onChange={(e) => setForm({ ...form, payDate: e.target.value })}
              className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <button
            onClick={handleCreate}
            disabled={pending}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            + เพิ่มงวด
          </button>
        </div>
      )}
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
