"use client";

import { useMemo, useState } from "react";
import { toBuddhistYear } from "@/lib/buddhist-year";

interface PayrollRow {
  TransactionID: number;
  Period: { PeriodYear: number; PeriodMonth: number; StartDate: string; EndDate: string; PayDate: string } | null;
  Site: { SiteName: string } | null;
  Details: { SiteCode: string | null; Amount: string; Site: { SiteName: string } | null }[];
  WorkDays: string;
  GrossWage: string;
  OtherIncome: string;
  TaxWithheld: string;
  SSOAmount: string;
  WelfareFundAmount: string;
  OtherDeduction: string;
  InstallmentDeduct: string;
  AdvanceDeduct: string;
  UniformDeduct: string;
  LoanDeduct: string;
  TrainingDeduct: string;
  NetPay: string;
  CreatedDate: string;
}

function thDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("th-TH") : "-";
}

const selectCls = "rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900";

export default function PayrollHistoryTab({ rows }: { rows: PayrollRow[] }) {
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");

  // ปี/เดือน อ้างอิงจากวันที่สิ้นสุดของงวด (ตามที่ขอ) ไม่ใช่
  // PeriodYear/PeriodMonth ที่เก็บไว้ตรงๆ — ปกติควรตรงกันเสมอ แต่ถ้าไม่ตรง
  // คอลัมน์นี้ (และตัวกรองนี้) ช่วยให้เห็นความคลาดเคลื่อนได้ทันที
  const withDerived = useMemo(
    () =>
      rows.map((r) => {
        const endDate = r.Period ? new Date(r.Period.EndDate) : null;
        const totalIncome = Number(r.GrossWage) + Number(r.OtherIncome);
        // ยอดรวมรายการหักทั้งหมดที่ประกอบเป็น NetPay จริง — ต้องรวมให้ตรงกับ
        // สูตรใน recomputeTransactionOtherTotals() เป๊ะ (statutory 3 ตัวแรก +
        // รายการหักแบบ rationed อีก 6 ตัว) ไม่งั้นยอดรวมนี้จะไม่บวกลบกับ
        // "ยอดรวมรายได้" แล้วได้ "ยอดจ่ายสุทธิ" พอดี
        const totalDeductions =
          Number(r.TaxWithheld) +
          Number(r.SSOAmount) +
          Number(r.WelfareFundAmount) +
          Number(r.OtherDeduction) +
          Number(r.InstallmentDeduct) +
          Number(r.AdvanceDeduct) +
          Number(r.UniformDeduct) +
          Number(r.LoanDeduct) +
          Number(r.TrainingDeduct);

        // "หน่วยงาน" = the site with the highest total INCOME Amount this
        // period (per-site breakdown from trn_payroll_transaction_detail),
        // not the transaction's own single SiteCode — falls back to that
        // legacy field only when there's no per-site breakdown at all (a
        // transaction never touched by a Worksheet pull, e.g. one entered
        // manually via "รายการประจำงวด" only).
        const bySite = new Map<string, { name: string; amount: number }>();
        for (const d of r.Details) {
          if (!d.SiteCode) continue;
          const entry = bySite.get(d.SiteCode) ?? { name: d.Site?.SiteName ?? d.SiteCode, amount: 0 };
          entry.amount += Number(d.Amount);
          bySite.set(d.SiteCode, entry);
        }
        const topSite = [...bySite.values()].sort((a, b) => b.amount - a.amount)[0];
        const siteName = topSite?.name ?? r.Site?.SiteName ?? null;

        return { ...r, endDate, yearBE: endDate ? toBuddhistYear(endDate.getFullYear()) : null, month: endDate ? endDate.getMonth() + 1 : null, totalIncome, totalDeductions, siteName };
      }),
    [rows],
  );

  const yearOptions = useMemo(() => [...new Set(withDerived.map((r) => r.yearBE).filter((y): y is number => y !== null))].sort((a, b) => b - a), [withDerived]);

  const filtered = withDerived.filter((r) => (year === "" || r.yearBE === Number(year)) && (month === "" || r.month === Number(month)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-gray-500">ปี</label>
          <select value={year} onChange={(e) => setYear(e.target.value)} className={selectCls}>
            <option value="">- ทั้งหมด -</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">เดือน</label>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectCls}>
            <option value="">- ทั้งหมด -</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">ปี</th>
              <th className="px-3 py-2 font-medium">เดือน</th>
              <th className="px-3 py-2 font-medium">วันที่เริ่มต้น</th>
              <th className="px-3 py-2 font-medium">วันที่สิ้นสุด</th>
              <th className="px-3 py-2 font-medium">จ่ายวันที่</th>
              <th className="px-3 py-2 font-medium">งวด</th>
              <th className="px-3 py-2 font-medium">หน่วยงาน</th>
              <th className="px-3 py-2 font-medium text-right">วันทำงาน</th>
              <th className="px-3 py-2 font-medium text-right">ยอดรวมรายได้</th>
              <th className="px-3 py-2 font-medium text-right">ยอดรวมรายการหัก</th>
              <th className="px-3 py-2 font-medium text-right">ยอดจ่ายสุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.TransactionID} className="border-t border-gray-100">
                <td className="px-3 py-2">{r.yearBE ?? "-"}</td>
                <td className="px-3 py-2">{r.month ?? "-"}</td>
                <td className="px-3 py-2">{r.Period ? thDate(r.Period.StartDate) : "-"}</td>
                <td className="px-3 py-2">{r.Period ? thDate(r.Period.EndDate) : "-"}</td>
                <td className="px-3 py-2">{r.Period ? thDate(r.Period.PayDate) : "-"}</td>
                <td className="px-3 py-2">{r.Period ? `${r.Period.PeriodMonth}/${toBuddhistYear(r.Period.PeriodYear)}` : "-"}</td>
                <td className="px-3 py-2 text-gray-500">{r.siteName ?? "-"}</td>
                <td className="px-3 py-2 text-right">{Number(r.WorkDays).toLocaleString("th-TH")}</td>
                <td className="px-3 py-2 text-right">{r.totalIncome.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right">{r.totalDeductions.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right font-medium">{Number(r.NetPay).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-gray-400">
                  {rows.length === 0 ? "ยังไม่มีประวัติการจ่ายเงินเดือน" : "ไม่พบรายการตามตัวกรองที่เลือก"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
