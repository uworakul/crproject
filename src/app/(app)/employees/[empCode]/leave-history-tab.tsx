"use client";

import { useState } from "react";
import { LEAVE_STATUS_LABELS, leaveIsAwaitingResubmit } from "@/lib/leave";
import { toBuddhistYear } from "@/lib/buddhist-year";

interface HistoryRow {
  LeaveID: number;
  DocumentNo: string | null;
  LeaveType: { LeaveTypeName: string };
  StartDate: string;
  EndDate: string;
  IsFullDay: boolean;
  HoursRequested: string | null;
  TotalDays: string;
  Status: string;
  RejectReason: string | null;
}

interface BalanceRow {
  leaveTypeCode: string;
  leaveTypeName: string;
  year: number;
  eligible: boolean;
  entitled: string;
  used: string;
  remaining: string;
}

export default function LeaveHistoryTab({ history, balances }: { history: HistoryRow[]; balances: BalanceRow[] }) {
  const years = Array.from(new Set(balances.map((b) => b.year))).sort((a, b) => b - a);
  const [yearFilter, setYearFilter] = useState("");

  const visibleBalances = balances.filter((b) => !yearFilter || String(b.year) === yearFilter);
  const visibleHistory = history.filter((h) => !yearFilter || new Date(h.StartDate).getFullYear() === Number(yearFilter));

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        ปี (พ.ศ.)
        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="w-40 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900">
          <option value="">- ทั้งหมด -</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {toBuddhistYear(y)}
            </option>
          ))}
        </select>
      </label>

      <div>
        <h2 className="mb-2 text-sm font-medium text-gray-900">สรุปสิทธิวันลา</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">ประเภท</th>
                <th className="px-3 py-2 font-medium">ปี</th>
                <th className="px-3 py-2 font-medium text-right">สิทธิ</th>
                <th className="px-3 py-2 font-medium text-right">ใช้ไป</th>
                <th className="px-3 py-2 font-medium text-right">คงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              {visibleBalances.map((b) => (
                <tr key={`${b.year}-${b.leaveTypeCode}`} className="border-t border-gray-100 hover:bg-purple-50">
                  <td className="px-3 py-2">{b.leaveTypeName}</td>
                  <td className="px-3 py-2">{toBuddhistYear(b.year)}</td>
                  <td className="px-3 py-2 text-right">{b.eligible ? b.entitled : "-"}</td>
                  <td className="px-3 py-2 text-right">{b.eligible ? b.used : "-"}</td>
                  <td className="px-3 py-2 text-right font-medium">{b.eligible ? b.remaining : "-"}</td>
                </tr>
              ))}
              {visibleBalances.length === 0 && (
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

      <div>
        <h2 className="mb-2 text-sm font-medium text-gray-900">ประวัติการลา</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">เลขที่เอกสาร</th>
                <th className="px-3 py-2 font-medium">ประเภท</th>
                <th className="px-3 py-2 font-medium">วันที่</th>
                <th className="px-3 py-2 font-medium text-right">จำนวน</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {visibleHistory.map((h) => {
                const awaitingResubmit = leaveIsAwaitingResubmit(h.Status, h.RejectReason);
                return (
                  <tr key={h.LeaveID} className="border-t border-gray-100 hover:bg-purple-50">
                    <td className="px-3 py-2">{h.DocumentNo ?? `#${h.LeaveID}`}</td>
                    <td className="px-3 py-2">{h.LeaveType.LeaveTypeName}</td>
                    <td className="px-3 py-2 text-gray-500">
                      {h.IsFullDay ? `${new Date(h.StartDate).toLocaleDateString("th-TH")} - ${new Date(h.EndDate).toLocaleDateString("th-TH")}` : new Date(h.StartDate).toLocaleDateString("th-TH")}
                    </td>
                    <td className="px-3 py-2 text-right">{h.IsFullDay ? `${h.TotalDays} วัน` : `${h.HoursRequested} ชม.`}</td>
                    <td className={`px-3 py-2 ${awaitingResubmit ? "text-red-600" : ""}`}>
                      {awaitingResubmit ? "ไม่อนุมัติ" : (LEAVE_STATUS_LABELS[h.Status as keyof typeof LEAVE_STATUS_LABELS] ?? h.Status)}
                    </td>
                  </tr>
                );
              })}
              {visibleHistory.length === 0 && (
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
    </div>
  );
}
