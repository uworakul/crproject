"use client";

import { useState } from "react";
import { LEAVE_STATUS_LABELS } from "@/lib/leave";
import { toBuddhistYear, toGregorianYear } from "@/lib/buddhist-year";

interface HistoryRow {
  LeaveID: number;
  DocumentNo: string | null;
  Employee: { FullName: string };
  LeaveType: { LeaveTypeName: string };
  StartDate: string;
  EndDate: string;
  TotalDays: string;
  Status: string;
}

// Balance summary is computed live (2026-09-21, see getLeaveBalanceSummary)
// and only returned by the API when both empCode and year are selected —
// it's a per-employee/per-year computation, unlike the raw history list
// which can span "ทั้งหมด".
interface BalanceRow {
  leaveTypeCode: string;
  leaveTypeName: string;
  empCode: string;
  employeeName: string;
  year: number;
  eligible: boolean;
  entitled: string;
  used: string;
  remaining: string;
}

export default function LeaveReportView({ employees }: { employees: { EmpCode: string; FullName: string }[] }) {
  const [empCode, setEmpCode] = useState("");
  const [year, setYear] = useState(String(toBuddhistYear(new Date().getFullYear())));
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const params = new URLSearchParams();
    if (empCode) params.set("empCode", empCode);
    if (year) params.set("year", String(toGregorianYear(Number(year))));
    const res = await fetch(`/api/leave/report?${params.toString()}`);
    if (res.ok) {
      const body = await res.json();
      setHistory(body.history);
      setBalances(body.balances);
      setLoaded(true);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          พนักงาน (ไม่ระบุ = ทั้งหมด)
          <select value={empCode} onChange={(e) => setEmpCode(e.target.value)} className="w-64 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900">
            <option value="">-- ทั้งหมด --</option>
            {employees.map((e) => (
              <option key={e.EmpCode} value={e.EmpCode}>
                {e.FullName} ({e.EmpCode})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          ปี (พ.ศ., ไม่ระบุ = ทั้งหมด)
          <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-28 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
        </label>
        <button onClick={load} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700">
          แสดงรายงาน
        </button>
      </div>

      {loaded && (
        <>
          <div>
            <h2 className="mb-2 text-sm font-medium text-gray-900">สรุปสิทธิวันลา</h2>
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full border-collapse text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">พนักงาน</th>
                    <th className="px-3 py-2 font-medium">ประเภท</th>
                    <th className="px-3 py-2 font-medium">ปี</th>
                    <th className="px-3 py-2 font-medium text-right">สิทธิ</th>
                    <th className="px-3 py-2 font-medium text-right">ใช้ไป</th>
                    <th className="px-3 py-2 font-medium text-right">คงเหลือ</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={`${b.year}-${b.leaveTypeCode}`} className="border-t border-gray-100">
                      <td className="px-3 py-2">{b.employeeName}</td>
                      <td className="px-3 py-2">{b.leaveTypeName}</td>
                      <td className="px-3 py-2">{toBuddhistYear(b.year)}</td>
                      <td className="px-3 py-2 text-right">{b.eligible ? b.entitled : "-"}</td>
                      <td className="px-3 py-2 text-right">{b.eligible ? b.used : "-"}</td>
                      <td className="px-3 py-2 text-right font-medium">{b.eligible ? b.remaining : "-"}</td>
                    </tr>
                  ))}
                  {balances.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                        {empCode ? "ยังไม่มีข้อมูล" : "เลือกพนักงานและปี เพื่อดูสรุปสิทธิวันลา"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium text-gray-900">ประวัติการลา</h2>
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
                  {history.map((h) => (
                    <tr key={h.LeaveID} className="border-t border-gray-100">
                      <td className="px-3 py-2">{h.Employee.FullName}</td>
                      <td className="px-3 py-2">{h.LeaveType.LeaveTypeName}</td>
                      <td className="px-3 py-2 text-gray-500">
                        {new Date(h.StartDate).toLocaleDateString("th-TH")} - {new Date(h.EndDate).toLocaleDateString("th-TH")}
                      </td>
                      <td className="px-3 py-2 text-right">{h.TotalDays}</td>
                      <td className="px-3 py-2">{LEAVE_STATUS_LABELS[h.Status as keyof typeof LEAVE_STATUS_LABELS] ?? h.Status}</td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                        ยังไม่มีข้อมูล
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
