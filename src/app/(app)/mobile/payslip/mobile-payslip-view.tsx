"use client";

import { useState } from "react";
import type { PayslipData, PayslipLine } from "@/lib/reports/payroll-reports";

interface PeriodOption {
  periodId: number;
  year: number;
  month: number;
  startDate: string;
  endDate: string;
  payDate: string;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "UTC" });
const money = (v: string) => Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function lineSuffix(l: PayslipLine) {
  if (l.days) return ` (${l.days} วัน)`;
  if (l.hours) return ` (${l.hours} ชม.)`;
  return "";
}

function Lines({ title, lines, total, tone }: { title: string; lines: PayslipLine[]; total: string; tone: string }) {
  return (
    <div>
      <h3 className={`text-sm font-semibold ${tone}`}>{title}</h3>
      <ul className="mt-1 divide-y divide-gray-100 text-sm">
        {lines.length === 0 && <li className="py-1.5 text-gray-400">ไม่มีรายการ</li>}
        {lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-3 py-1.5">
            <span className="text-gray-700">
              {l.label}
              {lineSuffix(l)}
            </span>
            <span className="tabular-nums text-gray-900">{money(l.amount)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex justify-between border-t border-gray-300 pt-1.5 text-sm font-medium">
        <span>รวม</span>
        <span className="tabular-nums">{money(total)}</span>
      </div>
    </div>
  );
}

export default function MobilePayslipView({ periods }: { periods: PeriodOption[] }) {
  const [periodId, setPeriodId] = useState("");
  const [slip, setSlip] = useState<PayslipData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function pick(value: string) {
    setPeriodId(value);
    setSlip(null);
    setError(null);
    if (!value) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/mobile/payslip?periodId=${value}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.message || body.error || "โหลดสลิปไม่สำเร็จ");
        return;
      }
      setSlip(body);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <label className="block text-sm text-gray-700">
        งวดที่จ่าย
        <select className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-base" value={periodId} onChange={(e) => pick(e.target.value)}>
          <option value="">{periods.length === 0 ? "- ยังไม่มีสลิปที่เปิดให้ดู -" : "- เลือกงวด -"}</option>
          {periods.map((p) => (
            <option key={p.periodId} value={p.periodId}>
              {fmtDate(p.startDate)} - {fmtDate(p.endDate)} (จ่าย {fmtDate(p.payDate)})
            </option>
          ))}
        </select>
      </label>
      {periods.length === 0 && <p className="text-sm text-gray-500">สลิปเงินเดือนจะแสดงเมื่องวดนั้นส่งขออนุมัติแล้วเท่านั้น</p>}

      {loading && <p className="text-sm text-gray-500">กำลังโหลด...</p>}
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {slip && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-600">
            <div className="font-medium text-gray-900">{slip.companyName}</div>
            <div>
              {slip.fullName} ({slip.empCode})
            </div>
            <div>
              {[slip.positionName, slip.deptName, slip.siteName].filter(Boolean).join(" · ")}
            </div>
            <div className="mt-1 text-xs text-gray-500">{slip.periodLabel}</div>
          </div>
          <Lines title="รายได้" lines={slip.incomeItems} total={slip.totalIncome} tone="text-green-700" />
          <Lines title="รายการหัก" lines={slip.deductionItems} total={slip.totalDeduction} tone="text-red-700" />
          <div className="flex justify-between rounded bg-blue-50 px-3 py-3 text-base font-semibold text-blue-900">
            <span>เงินได้สุทธิ</span>
            <span className="tabular-nums">{money(slip.netPay)}</span>
          </div>
          {slip.bankName && (
            <div className="text-xs text-gray-500">
              โอนเข้า {slip.bankName} {slip.bankAccountNo ?? ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
