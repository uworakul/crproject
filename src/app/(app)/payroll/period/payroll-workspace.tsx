"use client";

import { useState } from "react";
import { EMPLOYEE_TYPE_LABELS, type EmployeeType } from "@/lib/validation";
import { toBuddhistYear } from "@/lib/buddhist-year";

interface Period {
  PeriodID: number;
  EmployeeType: string;
  PeriodYear: number;
  PeriodMonth: number;
  Status: string;
}

interface Transaction {
  TransactionID: number;
  EmpCode: string;
  Employee: { FullName: string };
  Site: { SiteCode: string; SiteName: string };
  WorkDays: string;
  DoubleShiftDays: string;
  HolidayDays: string;
  OTHours: string;
  OTAmount: string;
  PositionAllowance: string;
  ShiftAllowance: string;
  AdvanceDeduct: string;
  LoanDeduct: string;
  TrainingDeduct: string;
  UniformDeduct: string;
  GrossWage: string;
  TaxWithheld: string;
  SSOAmount: string;
  OtherIncome: string;
  OtherDeduction: string;
  NetPay: string;
}

interface LockInfo {
  isLocked: boolean;
  lockedBy: string | null;
  lockedDate: string | null;
  employeeCount: number;
  totalNetPay: string;
}

interface ReportRow {
  siteCode: string;
  siteName: string;
  employeeCount: number;
  grossWage: number;
  taxWithheld: number;
  ssoAmount: number;
  netPay: number;
}

type EditableField =
  | "OTHours"
  | "OTAmount"
  | "PositionAllowance"
  | "ShiftAllowance"
  | "AdvanceDeduct"
  | "LoanDeduct"
  | "TrainingDeduct"
  | "UniformDeduct"
  | "OtherIncome"
  | "OtherDeduction";

const EDIT_FIELDS: { key: EditableField; label: string }[] = [
  { key: "OTHours", label: "ชม. OT" },
  { key: "OTAmount", label: "เงิน OT" },
  { key: "PositionAllowance", label: "เงินตำแหน่ง" },
  { key: "ShiftAllowance", label: "เบี้ยกะ" },
  { key: "AdvanceDeduct", label: "หักเบิกล่วงหน้า" },
  { key: "LoanDeduct", label: "หักเงินกู้" },
  { key: "TrainingDeduct", label: "หักค่าอบรม" },
  { key: "UniformDeduct", label: "หักเครื่องแบบ" },
  { key: "OtherIncome", label: "รายได้อื่น" },
  { key: "OtherDeduction", label: "หักอื่นๆ" },
];

export default function PayrollWorkspace({
  initialPeriods,
  canViewTransaction,
  canEditTransaction,
  canCalculate,
  canCancelCalculate,
  canViewLock,
  canLock,
  canClose,
  canViewReport,
}: {
  initialPeriods: Period[];
  canViewTransaction: boolean;
  canEditTransaction: boolean;
  canCalculate: boolean;
  canCancelCalculate: boolean;
  canViewLock: boolean;
  canLock: boolean;
  canClose: boolean;
  canViewReport: boolean;
}) {
  const [periods] = useState(initialPeriods);
  const [periodId, setPeriodId] = useState<number | null>(null);
  const [tab, setTab] = useState<"transactions" | "report">("transactions");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [lockInfo, setLockInfo] = useState<LockInfo | null>(null);
  const [report, setReport] = useState<{ bySite: ReportRow[]; grandTotal: ReportRow } | null>(null);
  const [empCodeFrom, setEmpCodeFrom] = useState("");
  const [empCodeTo, setEmpCodeTo] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadAll(id: number) {
    setMessage(null);
    const [txRes, lockRes] = await Promise.all([
      canViewTransaction ? fetch(`/api/payroll/transactions?periodId=${id}`) : null,
      canViewLock ? fetch(`/api/payroll/lock?periodId=${id}`) : null,
    ]);
    if (txRes?.ok) setTransactions(await txRes.json());
    if (lockRes?.ok) setLockInfo(await lockRes.json());
    if (canViewReport) {
      const repRes = await fetch(`/api/payroll/report?periodId=${id}`);
      if (repRes.ok) setReport(await repRes.json());
    }
  }

  async function selectPeriod(idStr: string) {
    const id = Number(idStr);
    setPeriodId(id || null);
    setEditingId(null);
    if (id) await loadAll(id);
  }

  async function refresh() {
    if (periodId) await loadAll(periodId);
  }

  async function handleCalculate() {
    if (!periodId) return;
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/payroll/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId, empCodeFrom: empCodeFrom || undefined, empCodeTo: empCodeTo || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      setMessage(`คำนวณสำเร็จ ${body.employeeCount} คน รวม ${Number(body.totalAmount).toLocaleString()} บาท`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelCalculate() {
    if (!periodId) return;
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/payroll/calculate/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      setMessage("ยกเลิกผลการคำนวณแล้ว");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleLock() {
    if (!periodId) return;
    setMessage(null);
    const res = await fetch("/api/payroll/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setMessage(body.message || body.error);
    await refresh();
  }

  async function handleUnlock() {
    if (!periodId) return;
    setMessage(null);
    const res = await fetch(`/api/payroll/lock?periodId=${periodId}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setMessage(body.message || body.error);
    await refresh();
  }

  async function handleClose() {
    if (!periodId) return;
    if (!confirm("ปิดงวดแล้วจะย้อนกลับไม่ได้ ยืนยันการปิดงวด?")) return;
    setMessage(null);
    const res = await fetch("/api/payroll/closing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    setMessage("ปิดงวดสำเร็จ");
    await refresh();
  }

  function startEdit(t: Transaction) {
    setEditingId(t.TransactionID);
    setEditForm(Object.fromEntries(EDIT_FIELDS.map((f) => [f.key, String(t[f.key] ?? "0")])));
  }

  async function saveEdit(id: number) {
    setMessage(null);
    const res = await fetch(`/api/payroll/transactions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(EDIT_FIELDS.map((f) => [f.key, Number(editForm[f.key] || 0)]))),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    setEditingId(null);
    await refresh();
  }

  const selectedPeriod = periods.find((p) => p.PeriodID === periodId);
  const isLocked = lockInfo?.isLocked ?? false;
  const isClosed = selectedPeriod?.Status === "CLOSED";

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        เลือกงวด
        <select onChange={(e) => selectPeriod(e.target.value)} className="w-80 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900">
          <option value="">-- เลือกงวด --</option>
          {periods.map((p) => (
            <option key={p.PeriodID} value={p.PeriodID}>
              {EMPLOYEE_TYPE_LABELS[p.EmployeeType as EmployeeType] ?? p.EmployeeType} — {p.PeriodMonth}/{toBuddhistYear(p.PeriodYear)} (
              {p.Status === "OPEN" ? "เปิด" : "ปิดแล้ว"})
            </option>
          ))}
        </select>
      </label>

      {periodId && (
        <>
          {lockInfo && (
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
              <p className="mb-2 font-medium text-gray-900">
                สถานะงวด: {isClosed ? <span className="text-gray-500">ปิดงวดแล้ว</span> : isLocked ? <span className="text-amber-600">ล็อกแล้ว</span> : <span className="text-green-600">เปิดแก้ไขได้</span>}
              </p>
              <p className="text-gray-600">
                จำนวนพนักงาน {lockInfo.employeeCount} คน — ยอดจ่ายสุทธิรวม {Number(lockInfo.totalNetPay).toLocaleString()} บาท
              </p>
              {lockInfo.lockedBy && (
                <p className="text-gray-400">
                  ล็อกโดย {lockInfo.lockedBy} เมื่อ {lockInfo.lockedDate ? new Date(lockInfo.lockedDate).toLocaleString("th-TH") : ""}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {canLock && !isClosed && !isLocked && (
                  <button onClick={handleLock} className="rounded-md bg-gray-900 px-3 py-1.5 text-white hover:bg-gray-700">
                    ล็อกงวด
                  </button>
                )}
                {canLock && !isClosed && isLocked && (
                  <button onClick={handleUnlock} className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50">
                    ปลดล็อก
                  </button>
                )}
                {canClose && !isClosed && isLocked && (
                  <button onClick={handleClose} className="rounded-md bg-red-700 px-3 py-1.5 text-white hover:bg-red-800">
                    ปิดงวด (ย้อนกลับไม่ได้)
                  </button>
                )}
              </div>
            </div>
          )}

          {(canCalculate || canCancelCalculate) && !isClosed && !isLocked && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 p-3">
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                รหัสพนักงานตั้งแต่ (ไม่ระบุ = ทั้งหมด)
                <input value={empCodeFrom} onChange={(e) => setEmpCodeFrom(e.target.value)} className="w-32 rounded border border-gray-300 px-2 py-1 text-sm" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                ถึง
                <input value={empCodeTo} onChange={(e) => setEmpCodeTo(e.target.value)} className="w-32 rounded border border-gray-300 px-2 py-1 text-sm" />
              </label>
              {canCalculate && (
                <button onClick={handleCalculate} disabled={busy} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
                  คำนวณเงินเดือน (ภาษี/ปกส.)
                </button>
              )}
              {canCancelCalculate && (
                <button onClick={handleCancelCalculate} disabled={busy} className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
                  ยกเลิกผลการคำนวณ
                </button>
              )}
            </div>
          )}

          {message && <p className="text-sm text-red-600">{message}</p>}

          {(canViewTransaction || canViewReport) && (
            <div className="flex gap-1 border-b border-gray-200">
              {canViewTransaction && (
                <button
                  onClick={() => setTab("transactions")}
                  className={`border-b-2 px-3 py-2 text-sm ${tab === "transactions" ? "border-gray-900 font-medium text-gray-900" : "border-transparent text-gray-500"}`}
                >
                  รายการจ่าย (Transaction)
                </button>
              )}
              {canViewReport && (
                <button
                  onClick={() => setTab("report")}
                  className={`border-b-2 px-3 py-2 text-sm ${tab === "report" ? "border-gray-900 font-medium text-gray-900" : "border-transparent text-gray-500"}`}
                >
                  รายงานสรุป
                </button>
              )}
            </div>
          )}

          {tab === "transactions" && canViewTransaction && (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full border-collapse text-xs">
                <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-2 py-2">พนักงาน</th>
                    <th className="px-2 py-2">หน่วยงาน</th>
                    <th className="px-2 py-2">วันทำงาน</th>
                    {EDIT_FIELDS.map((f) => (
                      <th key={f.key} className="px-2 py-2">
                        {f.label}
                      </th>
                    ))}
                    <th className="px-2 py-2">รายได้รวม</th>
                    <th className="px-2 py-2">ภาษี</th>
                    <th className="px-2 py-2">ปกส.</th>
                    <th className="px-2 py-2">สุทธิ</th>
                    {canEditTransaction && !isClosed && !isLocked && <th className="px-2 py-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => {
                    const isEditing = editingId === t.TransactionID;
                    return (
                      <tr key={t.TransactionID} className="border-t border-gray-100">
                        <td className="px-2 py-2">
                          {t.EmpCode} {t.Employee.FullName}
                        </td>
                        <td className="px-2 py-2">{t.Site.SiteName}</td>
                        <td className="px-2 py-2">
                          {t.WorkDays}/{t.DoubleShiftDays}/{t.HolidayDays}
                        </td>
                        {EDIT_FIELDS.map((f) => (
                          <td key={f.key} className="px-2 py-2">
                            {isEditing ? (
                              <input
                                type="number"
                                step="any"
                                value={editForm[f.key] ?? ""}
                                onChange={(e) => setEditForm({ ...editForm, [f.key]: e.target.value })}
                                className="w-20 rounded border border-gray-300 px-1 py-0.5 text-xs"
                              />
                            ) : (
                              t[f.key]
                            )}
                          </td>
                        ))}
                        <td className="px-2 py-2">{t.GrossWage}</td>
                        <td className="px-2 py-2">{t.TaxWithheld}</td>
                        <td className="px-2 py-2">{t.SSOAmount}</td>
                        <td className="px-2 py-2 font-medium">{t.NetPay}</td>
                        {canEditTransaction && !isClosed && !isLocked && (
                          <td className="px-2 py-2">
                            {isEditing ? (
                              <div className="flex gap-1">
                                <button onClick={() => saveEdit(t.TransactionID)} className="text-gray-900 hover:underline">
                                  บันทึก
                                </button>
                                <button onClick={() => setEditingId(null)} className="text-gray-400 hover:underline">
                                  ยกเลิก
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => startEdit(t)} className="text-gray-500 hover:underline">
                                แก้ไข
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={16} className="px-2 py-6 text-center text-gray-400">
                        ยังไม่มีรายการจ่าย — ต้องมี Worksheet อนุมัติแล้วในงวดนี้ก่อน
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "report" && canViewReport && report && (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full border-collapse text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-3 py-2">หน่วยงาน</th>
                    <th className="px-3 py-2">จำนวนคน</th>
                    <th className="px-3 py-2">รายได้รวม</th>
                    <th className="px-3 py-2">ภาษีหัก</th>
                    <th className="px-3 py-2">ปกส.</th>
                    <th className="px-3 py-2">จ่ายสุทธิ</th>
                  </tr>
                </thead>
                <tbody>
                  {report.bySite.map((r) => (
                    <tr key={r.siteCode} className="border-t border-gray-100">
                      <td className="px-3 py-2">{r.siteName}</td>
                      <td className="px-3 py-2">{r.employeeCount}</td>
                      <td className="px-3 py-2">{r.grossWage.toLocaleString()}</td>
                      <td className="px-3 py-2">{r.taxWithheld.toLocaleString()}</td>
                      <td className="px-3 py-2">{r.ssoAmount.toLocaleString()}</td>
                      <td className="px-3 py-2 font-medium">{r.netPay.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 font-semibold text-gray-900">
                    <td className="px-3 py-2">รวมทั้งสิ้น</td>
                    <td className="px-3 py-2">{report.grandTotal.employeeCount}</td>
                    <td className="px-3 py-2">{report.grandTotal.grossWage.toLocaleString()}</td>
                    <td className="px-3 py-2">{report.grandTotal.taxWithheld.toLocaleString()}</td>
                    <td className="px-3 py-2">{report.grandTotal.ssoAmount.toLocaleString()}</td>
                    <td className="px-3 py-2">{report.grandTotal.netPay.toLocaleString()}</td>
                  </tr>
                  {report.bySite.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                        ยังไม่มีข้อมูล
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
