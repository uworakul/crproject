"use client";

import { useState } from "react";
import { EMPLOYEE_TYPE_VALUES, EMPLOYEE_TYPE_LABELS, type EmployeeType } from "@/lib/validation";

interface Period {
  PeriodID: number;
  EmployeeType: string;
  PeriodYear: number;
  PeriodMonth: number;
  StartDate: string;
  EndDate: string;
  PayDate: string;
  Status: string;
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
        body: JSON.stringify(form),
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

  async function remove(p: Period) {
    setMessage(null);
    const res = await fetch(`/api/periods/${p.PeriodID}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    await refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">ประเภทพนักงาน</th>
              <th className="px-3 py-2 font-medium">งวด</th>
              <th className="px-3 py-2 font-medium">วันเริ่ม</th>
              <th className="px-3 py-2 font-medium">วันสิ้นสุด</th>
              <th className="px-3 py-2 font-medium">วันจ่าย</th>
              <th className="px-3 py-2 font-medium">สถานะ</th>
              {canDelete && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.PeriodID} className="border-t border-gray-100">
                <td className="px-3 py-2">{EMPLOYEE_TYPE_LABELS[p.EmployeeType as EmployeeType] ?? p.EmployeeType}</td>
                <td className="px-3 py-2">
                  {p.PeriodMonth}/{p.PeriodYear}
                </td>
                <td className="px-3 py-2 text-gray-500">{new Date(p.StartDate).toLocaleDateString("th-TH")}</td>
                <td className="px-3 py-2 text-gray-500">{new Date(p.EndDate).toLocaleDateString("th-TH")}</td>
                <td className="px-3 py-2 text-gray-500">{new Date(p.PayDate).toLocaleDateString("th-TH")}</td>
                <td className="px-3 py-2">
                  {p.Status === "OPEN" ? <span className="text-green-600">เปิด</span> : <span className="text-gray-400">ปิดแล้ว (Payroll Closing)</span>}
                </td>
                {canDelete && (
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => remove(p)} className="text-red-500 hover:underline">
                      ลบ
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {periods.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                  ยังไม่มีงวด
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
              value={form.periodYear}
              onChange={(e) => setForm({ ...form, periodYear: e.target.value })}
              className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            เดือน (1-12)
            <input
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
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
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
