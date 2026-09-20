"use client";

import { useState } from "react";
import Link from "next/link";
import { LEAVE_STATUS_LABELS } from "@/lib/leave";

interface LeaveRow {
  LeaveID: number;
  EmpCode: string;
  Employee: { FullName: string };
  LeaveType: { LeaveTypeName: string };
  StartDate: string;
  EndDate: string;
  TotalDays: string;
  Status: string;
}

export default function LeaveListView({
  initialRows,
  employees,
  leaveTypes,
  canSave,
  canApprove,
}: {
  initialRows: LeaveRow[];
  employees: { EmpCode: string; FullName: string }[];
  leaveTypes: { LeaveTypeCode: string; LeaveTypeName: string; RequireMedicalCert: boolean }[];
  canSave: boolean;
  canApprove: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState({ empCode: "", leaveTypeCode: "", startDate: "", endDate: "", totalDays: "", hasMedicalCert: false });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function refresh(status: string) {
    const res = await fetch(`/api/leave/requests${status ? `?status=${status}` : ""}`);
    if (res.ok) setRows(await res.json());
  }

  async function switchFilter(status: string) {
    setStatusFilter(status);
    await refresh(status);
  }

  async function handleCreate() {
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/leave/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, totalDays: Number(form.totalDays) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      setForm({ empCode: "", leaveTypeCode: "", startDate: "", endDate: "", totalDays: "", hasMedicalCert: false });
      await refresh(statusFilter);
    } finally {
      setPending(false);
    }
  }

  const selectedType = leaveTypes.find((t) => t.LeaveTypeCode === form.leaveTypeCode);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { value: "", label: "ทั้งหมด" },
          { value: "DRAFT", label: "ร่าง" },
          { value: "SUBMITTED", label: "รออนุมัติ" },
          { value: "APPROVED", label: "อนุมัติแล้ว" },
          { value: "REJECTED", label: "ไม่อนุมัติ" },
        ].map((t) => (
          <button
            key={t.value}
            onClick={() => switchFilter(t.value)}
            className={`border-b-2 px-3 py-2 text-sm ${statusFilter === t.value ? "border-gray-900 font-medium text-gray-900" : "border-transparent text-gray-500"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">พนักงาน</th>
              <th className="px-3 py-2 font-medium">ประเภท</th>
              <th className="px-3 py-2 font-medium">วันที่</th>
              <th className="px-3 py-2 font-medium text-right">จำนวนวัน</th>
              <th className="px-3 py-2 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.LeaveID} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2">
                  <Link href={`/leave/${r.LeaveID}`} className="text-gray-900 hover:underline">
                    {r.Employee.FullName}
                  </Link>
                </td>
                <td className="px-3 py-2">{r.LeaveType.LeaveTypeName}</td>
                <td className="px-3 py-2 text-gray-500">
                  {new Date(r.StartDate).toLocaleDateString("th-TH")} - {new Date(r.EndDate).toLocaleDateString("th-TH")}
                </td>
                <td className="px-3 py-2 text-right">{r.TotalDays}</td>
                <td className="px-3 py-2">{LEAVE_STATUS_LABELS[r.Status as keyof typeof LEAVE_STATUS_LABELS] ?? r.Status}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                  ยังไม่มีรายการ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canSave && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 p-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            พนักงาน
            <select value={form.empCode} onChange={(e) => setForm({ ...form, empCode: e.target.value })} className="w-56 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900">
              <option value="">-- เลือก --</option>
              {employees.map((e) => (
                <option key={e.EmpCode} value={e.EmpCode}>
                  {e.FullName} ({e.EmpCode})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            ประเภทการลา
            <select value={form.leaveTypeCode} onChange={(e) => setForm({ ...form, leaveTypeCode: e.target.value })} className="w-40 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900">
              <option value="">-- เลือก --</option>
              {leaveTypes.map((t) => (
                <option key={t.LeaveTypeCode} value={t.LeaveTypeCode}>
                  {t.LeaveTypeName}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            วันที่เริ่ม
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            วันที่สิ้นสุด
            <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            จำนวนวัน
            <input type="number" step="0.5" value={form.totalDays} onChange={(e) => setForm({ ...form, totalDays: e.target.value })} className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
          </label>
          {selectedType?.RequireMedicalCert && (
            <label className="flex items-center gap-1 pb-1.5 text-xs text-gray-500">
              <input type="checkbox" checked={form.hasMedicalCert} onChange={(e) => setForm({ ...form, hasMedicalCert: e.target.checked })} />
              แนบใบรับรองแพทย์แล้ว
            </label>
          )}
          <button onClick={handleCreate} disabled={pending} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
            + สร้างใบลา
          </button>
        </div>
      )}
      {message && <p className="text-sm text-red-600">{message}</p>}
      {canApprove && <p className="text-xs text-gray-400">คลิกรายการ &quot;รออนุมัติ&quot; เพื่ออนุมัติ/ไม่อนุมัติ</p>}
    </div>
  );
}
