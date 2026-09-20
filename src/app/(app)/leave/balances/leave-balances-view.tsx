"use client";

import { useState } from "react";
import { toBuddhistYear, toGregorianYear } from "@/lib/buddhist-year";

interface BalanceRow {
  leaveTypeCode: string;
  leaveTypeName: string;
  maxDaysPerYear: number;
  entitled: string;
  used: string;
  remaining: string;
}

export default function LeaveBalancesView({ employees, canSave }: { employees: { EmpCode: string; FullName: string }[]; canSave: boolean }) {
  const [empCode, setEmpCode] = useState("");
  // Displayed/typed as พ.ศ. — converted to Gregorian (toGregorianYear) only
  // at the API call boundary, matching mst_employee_leave_balance.Year's
  // storage convention (compared directly against StartDate.getUTCFullYear()
  // on approve).
  const [year, setYear] = useState(String(toBuddhistYear(new Date().getFullYear())));
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [entitledForm, setEntitledForm] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!empCode || !year) return;
    setMessage(null);
    const res = await fetch(`/api/leave/balances?empCode=${empCode}&year=${toGregorianYear(Number(year))}`);
    const body = await res.json().catch(() => ([]));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    setRows(body);
    setEntitledForm(Object.fromEntries(body.map((r: BalanceRow) => [r.leaveTypeCode, r.entitled])));
  }

  async function handleSave() {
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/leave/balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empCode,
          year: toGregorianYear(Number(year)),
          entries: rows.map((r) => ({ leaveTypeCode: r.leaveTypeCode, entitled: Number(entitledForm[r.leaveTypeCode] || 0) })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          พนักงาน
          <select value={empCode} onChange={(e) => setEmpCode(e.target.value)} className="w-64 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900">
            <option value="">-- เลือก --</option>
            {employees.map((e) => (
              <option key={e.EmpCode} value={e.EmpCode}>
                {e.FullName} ({e.EmpCode})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          ปี (พ.ศ.)
          <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-24 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
        </label>
        <button onClick={load} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          โหลดข้อมูล
        </button>
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">ประเภทการลา</th>
                <th className="px-3 py-2 font-medium">สิทธิ (วัน)</th>
                <th className="px-3 py-2 font-medium">ใช้ไปแล้ว</th>
                <th className="px-3 py-2 font-medium">คงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.leaveTypeCode} className="border-t border-gray-100">
                  <td className="px-3 py-2">{r.leaveTypeName}</td>
                  <td className="px-3 py-2">
                    {canSave ? (
                      <input
                        type="number"
                        step="any"
                        value={entitledForm[r.leaveTypeCode] ?? ""}
                        onChange={(e) => setEntitledForm({ ...entitledForm, [r.leaveTypeCode]: e.target.value })}
                        className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      r.entitled
                    )}
                  </td>
                  <td className="px-3 py-2">{r.used}</td>
                  <td className="px-3 py-2 font-medium">{r.remaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && canSave && (
        <button onClick={handleSave} disabled={busy} className="w-fit rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
          บันทึกสิทธิวันลา
        </button>
      )}
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
