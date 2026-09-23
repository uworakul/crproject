"use client";

import { Fragment, useState } from "react";
import Swal from "sweetalert2";
import { EMPLOYEE_TYPE_VALUES, EMPLOYEE_TYPE_LABELS } from "@/lib/validation";
import { toBuddhistYear } from "@/lib/buddhist-year";
import SearchableSelect from "../../searchable-select";

interface Period {
  PeriodID: number;
  EmployeeType: string;
  PeriodYear: number;
  PeriodMonth: number;
  StartDate: string;
  EndDate: string;
  Status: string;
  IsCurrent: boolean;
}

interface TransactionRow {
  TransactionID: number;
  EmpCode: string;
  Employee: { EmpCode: string; FullName: string; Site: { SiteName: string } | null };
  WorkDays: string;
  GrossWage: string;
  OTAmount: string;
  PositionAllowance: string;
  ShiftAllowance: string;
  OtherIncome: string;
  TaxWithheld: string;
  SSOAmount: string;
  WelfareFundAmount: string;
  InstallmentDeduct: string;
  AdvanceDeduct: string;
  LoanDeduct: string;
  TrainingDeduct: string;
  UniformDeduct: string;
  OtherDeduction: string;
  NetPay: string;
}

interface DetailRow {
  DetailID: number;
  LineType: "INCOME" | "DEDUCTION";
  Description: string;
  Hours: string | null;
  Days: string | null;
  Amount: string;
}

interface InstallmentLine {
  debtId: number;
  code: string;
  label: string;
  amount: string;
  remainingAmount: string;
}

function totalIncome(t: TransactionRow) {
  return Number(t.GrossWage) + Number(t.OTAmount) + Number(t.PositionAllowance) + Number(t.ShiftAllowance) + Number(t.OtherIncome);
}
function totalDeduction(t: TransactionRow) {
  return (
    Number(t.TaxWithheld) +
    Number(t.SSOAmount) +
    Number(t.WelfareFundAmount) +
    Number(t.InstallmentDeduct) +
    Number(t.AdvanceDeduct) +
    Number(t.LoanDeduct) +
    Number(t.TrainingDeduct) +
    Number(t.UniformDeduct) +
    Number(t.OtherDeduction)
  );
}
function money(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

async function confirmDialog(html: string, confirmText: string, color: string) {
  const result = await Swal.fire({ html, icon: "warning", showCancelButton: true, confirmButtonText: confirmText, cancelButtonText: "ยกเลิก", confirmButtonColor: color, cancelButtonColor: "#9ca3af" });
  return result.isConfirmed;
}

export default function PayrollCalculateView({
  periods,
  companies,
  departments,
  employees,
  canCalculate,
  canLock,
  canReadLock,
}: {
  periods: Period[];
  companies: { CompanyCode: string; CompanyName: string }[];
  departments: { DeptCode: string; DeptName: string }[];
  employees: { EmpCode: string; FullName: string }[];
  canCalculate: boolean;
  canLock: boolean;
  canReadLock: boolean;
}) {
  const [employeeType, setEmployeeType] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [empCode, setEmpCode] = useState("");
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [lockInfo, setLockInfo] = useState<{
    isLocked: boolean;
    lockedBy: string | null;
    isApproved: boolean;
    approvedBy: string | null;
    employeeCount: number;
    totalNetPay: string;
  } | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailsById, setDetailsById] = useState<Record<number, DetailRow[]>>({});
  const [installmentsById, setInstallmentsById] = useState<Record<number, InstallmentLine[]>>({});
  const [lastResult, setLastResult] = useState<{ documentNo: string | null; employeeCount: number; totalAmount: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const period = periods.find((p) => p.EmployeeType === employeeType && p.IsCurrent);

  async function refreshRows(periodId: number) {
    const params = new URLSearchParams({ periodId: String(periodId) });
    if (companyCode) params.set("companyCode", companyCode);
    if (deptCode) params.set("deptCode", deptCode);
    if (empCode) params.set("empCode", empCode);
    const res = await fetch(`/api/payroll/transactions?${params}`);
    if (res.ok) setRows(await res.json());
  }

  async function refreshLock(periodId: number) {
    if (!canReadLock) return;
    const res = await fetch(`/api/payroll/lock?periodId=${periodId}`);
    if (res.ok) {
      const body = await res.json();
      setLockInfo({
        isLocked: body.isLocked,
        lockedBy: body.lockedBy,
        isApproved: body.isApproved,
        approvedBy: body.approvedBy,
        employeeCount: body.employeeCount,
        totalNetPay: body.totalNetPay,
      });
    }
  }

  async function handleSelectType(v: string) {
    setEmployeeType(v);
    setLastResult(null);
    setMessage(null);
    const p = periods.find((pp) => pp.EmployeeType === v && pp.IsCurrent);
    if (p) {
      await Promise.all([refreshRows(p.PeriodID), refreshLock(p.PeriodID)]);
    } else {
      setRows([]);
      setLockInfo(null);
    }
  }

  async function applyFilters() {
    if (period) await refreshRows(period.PeriodID);
  }

  async function saveWorkDays(t: TransactionRow, value: string) {
    setMessage(null);
    const res = await fetch(`/api/payroll/transactions/${t.TransactionID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ WorkDays: Number(value) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    if (period) await refreshRows(period.PeriodID);
  }

  async function handleCalculate() {
    if (!period) return;
    if (!(await confirmDialog(`ยืนยันคำนวณเงินได้ประจำงวด ${period.PeriodMonth}/${toBuddhistYear(period.PeriodYear)}?`, "ยืนยันคำนวณ", "#16a34a"))) return;
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/payroll/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId: period.PeriodID, companyCode: companyCode || undefined, deptCode: deptCode || undefined, empCode: empCode || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      setLastResult({ documentNo: body.documentNo, employeeCount: body.employeeCount, totalAmount: body.totalAmount });
      await refreshRows(period.PeriodID);
    } finally {
      setPending(false);
    }
  }

  async function handleCancelCalculate() {
    if (!period) return;
    if (!(await confirmDialog("ยืนยันยกเลิกผลการคำนวณของงวดนี้? (ภาษี/ประกันสังคม/กองทุนสงเคราะห์พนักงาน/หักเป็นงวดจะถูกล้างเป็น 0)", "ยืนยันยกเลิก", "#dc2626"))) return;
    setMessage(null);
    const res = await fetch("/api/payroll/calculate/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ periodId: period.PeriodID }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    setLastResult(null);
    await refreshRows(period.PeriodID);
  }

  async function handleSubmitForApproval() {
    if (!period) return;
    if (!(await confirmDialog(`ยืนยันส่งขออนุมัติ (Lock) งวด ${period.PeriodMonth}/${toBuddhistYear(period.PeriodYear)}? หลังจากนี้จะแก้ไขรายการในงวดนี้ไม่ได้จนกว่าจะตีคืน`, "ส่งขออนุมัติ", "#16a34a")))
      return;
    setMessage(null);
    const res = await fetch("/api/payroll/lock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ periodId: period.PeriodID }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    await refreshLock(period.PeriodID);
  }

  async function handleApprove() {
    if (!period) return;
    if (!(await confirmDialog(`ยืนยันอนุมัติงวด ${period.PeriodMonth}/${toBuddhistYear(period.PeriodYear)}? หลังจากนี้จะปิดสิ้นงวดได้`, "ยืนยันอนุมัติ", "#16a34a"))) return;
    setMessage(null);
    const res = await fetch("/api/payroll/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ periodId: period.PeriodID }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    await refreshLock(period.PeriodID);
  }

  async function handleUnlock() {
    if (!period) return;
    if (!(await confirmDialog("ยืนยันตีคืนงวดนี้? สถานะจะกลับไปแก้ไขได้ ต้องส่งขออนุมัติและอนุมัติใหม่อีกครั้ง", "ยืนยันตีคืน", "#dc2626"))) return;
    setMessage(null);
    const res = await fetch(`/api/payroll/lock?periodId=${period.PeriodID}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    await refreshLock(period.PeriodID);
  }

  async function toggleExpand(t: TransactionRow) {
    if (expandedId === t.TransactionID) {
      setExpandedId(null);
      return;
    }
    setExpandedId(t.TransactionID);
    if (!detailsById[t.TransactionID]) {
      const res = await fetch(`/api/payroll/transaction-details?transactionId=${t.TransactionID}`);
      if (res.ok) setDetailsById({ ...detailsById, [t.TransactionID]: await res.json() });
    }
    if (!installmentsById[t.TransactionID]) {
      // transactionId, not empCode (2026-09-22) — the priority-rationed
      // amount shown per debt depends on this specific transaction's income/
      // other-deduction context, not just which debts the employee has open.
      const res = await fetch(`/api/payroll/installment-deductions?transactionId=${t.TransactionID}`);
      if (res.ok) setInstallmentsById({ ...installmentsById, [t.TransactionID]: await res.json() });
    }
  }

  const grandTotalIncome = rows.reduce((s, t) => s + totalIncome(t), 0);
  const grandTotalDeduction = rows.reduce((s, t) => s + totalDeduction(t), 0);
  const grandTotalNet = rows.reduce((s, t) => s + Number(t.NetPay), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          ประเภทพนักงาน
          <select value={employeeType} onChange={(e) => handleSelectType(e.target.value)} className="w-40 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900">
            <option value="">-- เลือก --</option>
            {EMPLOYEE_TYPE_VALUES.map((v) => (
              <option key={v} value={v}>
                {EMPLOYEE_TYPE_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        {employeeType && !period && <p className="pb-1.5 text-sm text-red-600">ไม่มีงวดปัจจุบันสำหรับประเภทพนักงานนี้ — ไปตั้งค่าที่หน้า งวดการจ่าย</p>}
        {period && (
          <>
            <div className="pb-1.5 text-sm">
              <span className="text-gray-500">งวดปัจจุบัน: </span>
              <span className="font-medium">
                {period.PeriodMonth}/{toBuddhistYear(period.PeriodYear)} ({new Date(period.StartDate).toLocaleDateString("th-TH")} - {new Date(period.EndDate).toLocaleDateString("th-TH")})
              </span>
            </div>
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              บริษัท
              <select value={companyCode} onChange={(e) => setCompanyCode(e.target.value)} className="w-40 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900">
                <option value="">- ทั้งหมด -</option>
                {companies.map((c) => (
                  <option key={c.CompanyCode} value={c.CompanyCode}>
                    {c.CompanyName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              แผนก
              <select value={deptCode} onChange={(e) => setDeptCode(e.target.value)} className="w-40 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900">
                <option value="">- ทั้งหมด -</option>
                {departments.map((d) => (
                  <option key={d.DeptCode} value={d.DeptCode}>
                    {d.DeptName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              รหัสพนักงานเฉพาะคน
              <div className="w-56">
                <SearchableSelect value={empCode} onChange={setEmpCode} options={employees.map((e) => ({ code: e.EmpCode, label: `${e.EmpCode} — ${e.FullName}` }))} placeholder="ไม่ระบุ = ทุกคน" />
              </div>
            </label>
            <button onClick={applyFilters} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
              กรอง
            </button>
            {canCalculate && (
              <button onClick={handleCalculate} disabled={pending || lockInfo?.isLocked} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
                คำนวณ
              </button>
            )}
            {canCalculate && (
              <button onClick={handleCancelCalculate} disabled={lockInfo?.isLocked} className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
                ยกเลิกคำนวณ
              </button>
            )}
          </>
        )}
      </div>

      {message && <p className="text-sm text-red-600">{message}</p>}

      {lastResult && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          คำนวณสำเร็จ — เลขที่เอกสาร {lastResult.documentNo ?? "-"} — {lastResult.employeeCount} คน — ยอดสุทธิรวม {money(Number(lastResult.totalAmount))} บาท
        </div>
      )}

      {canReadLock && lockInfo && (
        <div className="flex items-center justify-between rounded-md border border-gray-200 bg-white p-3 text-sm">
          <span>
            สถานะ:{" "}
            {lockInfo.isApproved ? (
              <span className="font-medium text-green-700">อนุมัติแล้ว</span>
            ) : lockInfo.isLocked ? (
              <span className="font-medium text-amber-600">ส่งขออนุมัติแล้ว (Locked) — รออนุมัติ</span>
            ) : (
              <span className="text-gray-500">ยังไม่ส่งขออนุมัติ</span>
            )}
            {lockInfo.isApproved && lockInfo.approvedBy && <span className="text-gray-400"> — อนุมัติโดย {lockInfo.approvedBy}</span>}
            {!lockInfo.isApproved && lockInfo.isLocked && lockInfo.lockedBy && <span className="text-gray-400"> — ส่งโดย {lockInfo.lockedBy}</span>}
          </span>
          <div className="flex gap-2">
            {canLock && !lockInfo.isLocked && (
              <button onClick={handleSubmitForApproval} className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700">
                ส่งขออนุมัติ
              </button>
            )}
            {canLock && lockInfo.isLocked && !lockInfo.isApproved && (
              <button onClick={handleApprove} className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700">
                อนุมัติ
              </button>
            )}
            {canLock && lockInfo.isLocked && (
              <button onClick={handleUnlock} className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
                ตีคืน
              </button>
            )}
          </div>
        </div>
      )}

      {period && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">ลำดับที่</th>
                <th className="px-3 py-2 font-medium">รหัส-ชื่อพนักงาน</th>
                <th className="px-3 py-2 font-medium">หน่วยงานหลัก</th>
                <th className="px-3 py-2 font-medium text-right">จำนวนวันทำงาน</th>
                <th className="px-3 py-2 font-medium text-right">รายได้รวม</th>
                <th className="px-3 py-2 font-medium text-right">รายการหักรวม</th>
                <th className="px-3 py-2 font-medium text-right">สุทธิ</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => {
                const isExpanded = expandedId === t.TransactionID;
                const details = detailsById[t.TransactionID] ?? [];
                return (
                  <Fragment key={t.TransactionID}>
                    <tr className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2">{i + 1}</td>
                      <td className="px-3 py-2">
                        {t.EmpCode} — {t.Employee.FullName}
                      </td>
                      <td className="px-3 py-2">{t.Employee.Site?.SiteName ?? "-"}</td>
                      <td className="px-3 py-2 text-right">
                        {lockInfo?.isLocked ? (
                          t.WorkDays
                        ) : (
                          <input
                            type="number"
                            step="any"
                            defaultValue={t.WorkDays}
                            onBlur={(e) => e.target.value !== t.WorkDays && saveWorkDays(t, e.target.value)}
                            className="w-16 rounded border border-gray-300 px-1 py-0.5 text-right text-sm"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{money(totalIncome(t))}</td>
                      <td className="px-3 py-2 text-right">{money(totalDeduction(t))}</td>
                      <td className="px-3 py-2 text-right font-medium">{money(Number(t.NetPay))}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => toggleExpand(t)} className="text-gray-500 hover:underline">
                          {isExpanded ? "▾ ซ่อน" : "▸ รายละเอียด"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded &&
                      (() => {
                        const installments = installmentsById[t.TransactionID] ?? [];
                        // Legacy Worksheet-era fields (GrossWage/OT/PositionAllowance/
                        // ShiftAllowance, AdvanceDeduct/LoanDeduct/TrainingDeduct/
                        // UniformDeduct) still count toward the row/grand totals and
                        // NetPay — hidden here only when zero so a transaction created
                        // entirely from "รายการประจำงวด" doesn't show a wall of 0.00
                        // rows, while a Worksheet-sourced transaction still shows where
                        // its GrossWage came from (2026-09-21).
                        const legacyIncome = [
                          { label: "ค่าแรงพื้นฐาน (GrossWage)", value: t.GrossWage },
                          { label: "ค่าล่วงเวลา (OT)", value: t.OTAmount },
                          { label: "เงินประจำตำแหน่ง", value: t.PositionAllowance },
                          { label: "เบี้ยกะ", value: t.ShiftAllowance },
                        ].filter((r) => Number(r.value) !== 0);
                        const legacyDeduction = [
                          { label: "หักเบิกล่วงหน้า", value: t.AdvanceDeduct },
                          { label: "หักเงินกู้", value: t.LoanDeduct },
                          { label: "หักค่าอบรม", value: t.TrainingDeduct },
                          { label: "หักเครื่องแบบ", value: t.UniformDeduct },
                        ].filter((r) => Number(r.value) !== 0);
                        return (
                          <tr className="border-t border-gray-100 bg-gray-50">
                            <td colSpan={8} className="px-3 py-3">
                              <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                  <p className="mb-1 font-medium text-gray-700">รายได้</p>
                                  <table className="w-full">
                                    <tbody>
                                      {legacyIncome.map((r) => (
                                        <tr key={r.label}>
                                          <td className="py-0.5 text-gray-500">{r.label}</td>
                                          <td></td>
                                          <td className="py-0.5 text-right">{money(Number(r.value))}</td>
                                        </tr>
                                      ))}
                                      {details
                                        .filter((d) => d.LineType === "INCOME" && Number(d.Amount) !== 0)
                                        .map((d) => (
                                          <tr key={d.DetailID}>
                                            <td className="py-0.5 text-gray-500">{d.Description}</td>
                                            <td className="py-0.5 text-right text-gray-400">{d.Days !== null ? `${d.Days} วัน` : d.Hours !== null ? `${d.Hours} ชม.` : "-"}</td>
                                            <td className="py-0.5 text-right">{money(Number(d.Amount))}</td>
                                          </tr>
                                        ))}
                                      {legacyIncome.length === 0 && details.filter((d) => d.LineType === "INCOME" && Number(d.Amount) !== 0).length === 0 && (
                                        <tr>
                                          <td colSpan={3} className="py-0.5 text-gray-400">
                                            ไม่มีรายการ
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                                <div>
                                  <p className="mb-1 font-medium text-gray-700">รายการหัก</p>
                                  <table className="w-full">
                                    <tbody>
                                      {Number(t.TaxWithheld) !== 0 && (
                                        <tr>
                                          <td className="py-0.5 text-gray-500">ภาษีหัก ณ ที่จ่าย</td>
                                          <td className="py-0.5 text-right">{money(Number(t.TaxWithheld))}</td>
                                        </tr>
                                      )}
                                      {Number(t.SSOAmount) !== 0 && (
                                        <tr>
                                          <td className="py-0.5 text-gray-500">ประกันสังคม</td>
                                          <td className="py-0.5 text-right">{money(Number(t.SSOAmount))}</td>
                                        </tr>
                                      )}
                                      {Number(t.WelfareFundAmount) !== 0 && (
                                        <tr>
                                          <td className="py-0.5 text-gray-500">กองทุนสงเคราะห์พนักงาน</td>
                                          <td className="py-0.5 text-right">{money(Number(t.WelfareFundAmount))}</td>
                                        </tr>
                                      )}
                                      {legacyDeduction.map((r) => (
                                        <tr key={r.label}>
                                          <td className="py-0.5 text-gray-500">{r.label}</td>
                                          <td className="py-0.5 text-right">{money(Number(r.value))}</td>
                                        </tr>
                                      ))}
                                      {details
                                        .filter((d) => d.LineType === "DEDUCTION" && Number(d.Amount) !== 0)
                                        .map((d) => (
                                          <tr key={d.DetailID}>
                                            <td className="py-0.5 text-gray-500">{d.Description}</td>
                                            <td className="py-0.5 text-right">{money(Number(d.Amount))}</td>
                                          </tr>
                                        ))}
                                      {installments
                                        .filter((line) => Number(line.amount) !== 0)
                                        .map((line) => (
                                          <tr key={line.debtId}>
                                            <td className="py-0.5 text-gray-500">
                                              {line.label} <span className="text-gray-400">(คงเหลือ {money(Number(line.remainingAmount))})</span>
                                            </td>
                                            <td className="py-0.5 text-right">{money(Number(line.amount))}</td>
                                          </tr>
                                        ))}
                                      {Number(t.TaxWithheld) === 0 &&
                                        Number(t.SSOAmount) === 0 &&
                                        Number(t.WelfareFundAmount) === 0 &&
                                        legacyDeduction.length === 0 &&
                                        details.filter((d) => d.LineType === "DEDUCTION" && Number(d.Amount) !== 0).length === 0 &&
                                        installments.filter((line) => Number(line.amount) !== 0).length === 0 && (
                                          <tr>
                                            <td colSpan={2} className="py-0.5 text-gray-400">
                                              ไม่มีรายการ
                                            </td>
                                          </tr>
                                        )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })()}
                  </Fragment>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-gray-400">
                    ยังไม่มีรายการในงวดนี้
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t border-gray-200 bg-gray-50 font-medium">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-right text-gray-500">
                    รวมทั้งหมด ({rows.length} คน)
                  </td>
                  <td className="px-3 py-2 text-right">{money(grandTotalIncome)}</td>
                  <td className="px-3 py-2 text-right">{money(grandTotalDeduction)}</td>
                  <td className="px-3 py-2 text-right">{money(grandTotalNet)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
