"use client";

import { useState } from "react";
import Link from "next/link";
import { LEAVE_STATUS_LABELS, leaveIsAwaitingResubmit, isLeaveTypeEligible, LEAVE_HOURS_PER_DAY } from "@/lib/leave";
import SearchableSelect from "../searchable-select";

interface LeaveRow {
  LeaveID: number;
  DocumentNo: string | null;
  EmpCode: string;
  Employee: { FullName: string };
  LeaveType: { LeaveTypeName: string };
  StartDate: string;
  EndDate: string;
  IsFullDay: boolean;
  HoursRequested: string | null;
  TotalDays: string;
  Status: string;
  RejectReason: string | null;
}

interface LeaveTypeOption {
  LeaveTypeCode: string;
  LeaveTypeName: string;
  RequireMedicalCert: boolean;
  EligibleEmployeeType: string | null;
}

const emptyForm = { empCode: "", leaveTypeCode: "", startDate: "", endDate: "", isFullDay: true, hoursRequested: "", hasMedicalCert: false };

export default function LeaveListView({
  initialRows,
  employees,
  leaveTypes,
  canSave,
  canApprove,
}: {
  initialRows: LeaveRow[];
  employees: { EmpCode: string; FullName: string; EmployeeType: string }[];
  leaveTypes: LeaveTypeOption[];
  canSave: boolean;
  canApprove: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState(emptyForm);
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
        body: JSON.stringify({
          empCode: form.empCode,
          leaveTypeCode: form.leaveTypeCode,
          startDate: form.startDate,
          endDate: form.isFullDay ? form.endDate : form.startDate,
          isFullDay: form.isFullDay,
          hoursRequested: form.isFullDay ? undefined : Number(form.hoursRequested),
          hasMedicalCert: form.hasMedicalCert,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      setForm(emptyForm);
      await refresh(statusFilter);
    } finally {
      setPending(false);
    }
  }

  const selectedEmployee = employees.find((e) => e.EmpCode === form.empCode);
  const eligibleTypes = selectedEmployee ? leaveTypes.filter((t) => isLeaveTypeEligible(t.EligibleEmployeeType, selectedEmployee.EmployeeType)) : leaveTypes;
  const selectedType = leaveTypes.find((t) => t.LeaveTypeCode === form.leaveTypeCode);

  let totalPreview: string | null = null;
  if (form.isFullDay) {
    if (form.startDate && form.endDate) {
      const start = new Date(form.startDate);
      const end = new Date(form.endDate);
      if (end >= start) {
        const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
        totalPreview = `รวม ${days} วัน`;
      }
    }
  } else {
    const hours = Number(form.hoursRequested);
    if (Number.isFinite(hours) && hours > 0) {
      totalPreview = `รวม ${hours} ชม. (= ${(hours / LEAVE_HOURS_PER_DAY).toFixed(2)} วัน)`;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { value: "", label: "ทั้งหมด" },
          { value: "DRAFT", label: "ร่าง" },
          { value: "SUBMITTED", label: "รออนุมัติ" },
          { value: "APPROVED", label: "อนุมัติแล้ว" },
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
              <th className="px-3 py-2 font-medium">เลขที่เอกสาร</th>
              <th className="px-3 py-2 font-medium">พนักงาน</th>
              <th className="px-3 py-2 font-medium">ประเภท</th>
              <th className="px-3 py-2 font-medium">วันที่</th>
              <th className="px-3 py-2 font-medium text-right">จำนวน</th>
              <th className="px-3 py-2 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const awaitingResubmit = leaveIsAwaitingResubmit(r.Status, r.RejectReason);
              return (
                <tr key={r.LeaveID} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link href={`/leave/${r.LeaveID}`} className="text-gray-900 hover:underline">
                      {r.DocumentNo ?? `#${r.LeaveID}`}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {r.Employee.FullName} ({r.EmpCode})
                  </td>
                  <td className="px-3 py-2">{r.LeaveType.LeaveTypeName}</td>
                  <td className="px-3 py-2 text-gray-500">
                    {r.IsFullDay
                      ? `${new Date(r.StartDate).toLocaleDateString("th-TH")} - ${new Date(r.EndDate).toLocaleDateString("th-TH")}`
                      : new Date(r.StartDate).toLocaleDateString("th-TH")}
                  </td>
                  <td className="px-3 py-2 text-right">{r.IsFullDay ? `${r.TotalDays} วัน` : `${r.HoursRequested} ชม.`}</td>
                  <td className={`px-3 py-2 ${awaitingResubmit ? "text-red-600" : ""}`}>
                    {awaitingResubmit ? "ไม่อนุมัติ" : (LEAVE_STATUS_LABELS[r.Status as keyof typeof LEAVE_STATUS_LABELS] ?? r.Status)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                  ยังไม่มีรายการ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canSave && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-gray-300 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              พนักงาน
              <div className="w-56">
                <SearchableSelect
                  value={form.empCode}
                  onChange={(code) => setForm({ ...form, empCode: code, leaveTypeCode: "" })}
                  options={employees.map((e) => ({ code: e.EmpCode, label: `${e.FullName} (${e.EmpCode})` }))}
                  placeholder="ค้นหารหัส/ชื่อพนักงาน"
                />
              </div>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              ประเภทการลา
              <select value={form.leaveTypeCode} onChange={(e) => setForm({ ...form, leaveTypeCode: e.target.value })} className="w-48 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900">
                <option value="">-- เลือก --</option>
                {eligibleTypes.map((t) => (
                  <option key={t.LeaveTypeCode} value={t.LeaveTypeCode}>
                    {t.LeaveTypeName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 pb-1.5 text-xs text-gray-500">
              <input
                type="checkbox"
                checked={form.isFullDay}
                onChange={(e) => setForm({ ...form, isFullDay: e.target.checked, endDate: e.target.checked ? form.endDate : "", hoursRequested: e.target.checked ? "" : form.hoursRequested })}
              />
              ทั้งวัน
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              วันที่เริ่ม
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
            </label>
            {form.isFullDay ? (
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                วันที่สิ้นสุด
                <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
              </label>
            ) : (
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                จำนวนชั่วโมง
                <input
                  type="number"
                  step="any"
                  value={form.hoursRequested}
                  onChange={(e) => setForm({ ...form, hoursRequested: e.target.value })}
                  className="w-24 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                />
              </label>
            )}
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
          {totalPreview && <p className="text-xs text-gray-500">{totalPreview}</p>}
        </div>
      )}
      {message && <p className="text-sm text-red-600">{message}</p>}
      {canApprove && <p className="text-xs text-gray-400">คลิกรายการ &quot;รออนุมัติ&quot; เพื่ออนุมัติ/ไม่อนุมัติ</p>}
    </div>
  );
}
