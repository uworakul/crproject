"use client";

import { Fragment, useState } from "react";
import Swal from "sweetalert2";
import { toBuddhistYear } from "@/lib/buddhist-year";
import { EMPLOYEE_TYPE_VALUES, EMPLOYEE_TYPE_LABELS } from "@/lib/validation";
import SearchableSelect from "../../searchable-select";
import TransactionDetailPanel from "./transaction-detail-panel";

interface Period {
  PeriodID: number;
  EmployeeType: string;
  PeriodYear: number;
  PeriodMonth: number;
  IsCurrent: boolean;
  StartDate: string;
  EndDate: string;
}

interface PeriodInfo {
  PeriodID: number;
  PeriodYear: number;
  PeriodMonth: number;
  StartDate: string;
  EndDate: string;
}

interface Row {
  TransactionID: number;
  EmpCode: string;
  WorkDays: string;
  DoubleShiftDays: string;
  HolidayDays: string;
  Employee: { EmpCode: string; FullName: string; Department: { DeptName: string } | null; Site: { SiteName: string } | null };
}

interface FullTransaction {
  TransactionID: number;
  WorkDays: string;
  GrossWage: string;
  OtherIncome: string;
  OtherDeduction: string;
  NetPay: string;
  Details: {
    DetailID: number;
    LineType: "INCOME" | "DEDUCTION";
    Code: string;
    Description: string;
    SiteCode: string | null;
    PositionCode: string | null;
    Site: { SiteName: string } | null;
    Position: { PositionName: string } | null;
    Hours: string | null;
    Days: string | null;
    Amount: string;
  }[];
}

async function confirmDeleteTransaction(label: string): Promise<boolean> {
  const result = await Swal.fire({
    html: `ยืนยันการลบรายการประจำงวดของ "${label}"? (รายละเอียดรายได้/รายการหักทั้งหมดของพนักงานคนนี้ในงวดนี้จะถูกลบไปด้วย)`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

async function confirmPullFromWorksheet(): Promise<boolean> {
  const result = await Swal.fire({
    html: "ดึงข้อมูลจาก Worksheet? ระบบจะเพิ่มพนักงานที่มีใบลงเวลาที่<b>อนุมัติแล้ว</b>ของงวดนี้ที่ยังไม่มีในตาราง และคำนวณจำนวนวัน/จำนวนเงินของรายการรายได้แบบรายวันใหม่ให้ทุกคน (ทับค่าเดิมที่เคยกรอกไว้ในรายการเหล่านั้น)",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#16a34a",
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

export default function TransactionEntryView({
  periods,
  companies,
  employees,
  incomeTypes,
  deductionTypes,
  canSave,
  canDelete,
  canReadLock,
}: {
  periods: Period[];
  companies: { CompanyCode: string; CompanyName: string }[];
  employees: { EmpCode: string; FullName: string; EmployeeType: string; CompanyCode: string | null }[];
  incomeTypes: { IncomeCode: string; IncomeName: string }[];
  deductionTypes: { DeductionCode: string; DeductionName: string; IsInstallment: boolean; IsAutoCalculated: boolean }[];
  canSave: boolean;
  canDelete: boolean;
  canReadLock: boolean;
}) {
  const [employeeType, setEmployeeType] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [expandedEmpCode, setExpandedEmpCode] = useState<string | null>(null);
  const [panelData, setPanelData] = useState<Record<string, { period: PeriodInfo; transaction: FullTransaction; rateConfig: Record<string, { amount: string; rateBasis: string }> }>>({});
  const [addEmpCode, setAddEmpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // 2026-09-22: the backend already rejects every mutation here with 409
  // PERIOD_LOCKED once a period is locked (ส่งขออนุมัติแล้ว) — this state is
  // purely so the UI can hide/disable แก้ไข/ลบ/ดึงข้อมูลจาก Worksheet/เพิ่ม
  // พนักงาน up front instead of letting the user go through a confirm dialog
  // only to have it fail, per the user's report (screenshot: delete confirm
  // popped up on a locked period with no indication it was locked at all).
  const [isLocked, setIsLocked] = useState(false);

  const period = periods.find((p) => p.EmployeeType === employeeType && p.IsCurrent);

  async function refreshRows(periodId: number, company: string) {
    const params = new URLSearchParams({ periodId: String(periodId) });
    if (company) params.set("companyCode", company);
    const res = await fetch(`/api/payroll/transactions?${params}`);
    if (res.ok) setRows(await res.json());
  }

  async function refreshLock(periodId: number) {
    if (!canReadLock) return;
    const res = await fetch(`/api/payroll/lock?periodId=${periodId}`);
    if (res.ok) setIsLocked((await res.json()).isLocked);
  }

  async function handleSelectType(v: string) {
    setEmployeeType(v);
    setMessage(null);
    setExpandedEmpCode(null);
    const p = periods.find((pp) => pp.EmployeeType === v && pp.IsCurrent);
    if (p) await Promise.all([refreshRows(p.PeriodID, companyCode), refreshLock(p.PeriodID)]);
    else {
      setRows([]);
      setIsLocked(false);
    }
  }

  async function handleSelectCompany(v: string) {
    setCompanyCode(v);
    if (period) await refreshRows(period.PeriodID, v);
  }

  async function toggleExpand(empCode: string) {
    if (expandedEmpCode === empCode) {
      setExpandedEmpCode(null);
      return;
    }
    setExpandedEmpCode(empCode);
    if (!panelData[empCode]) {
      const res = await fetch(`/api/payroll/transactions/by-employee?empCode=${encodeURIComponent(empCode)}`);
      if (res.ok) {
        const body = await res.json();
        setPanelData({ ...panelData, [empCode]: body });
      }
    }
  }

  async function handleAddEmployee() {
    if (!addEmpCode) return;
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll/transactions/by-employee?empCode=${encodeURIComponent(addEmpCode)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      setAddEmpCode("");
      if (period) await refreshRows(period.PeriodID, companyCode);
    } finally {
      setLoading(false);
    }
  }

  async function handlePullFromWorksheet() {
    if (!period) return;
    if (!(await confirmPullFromWorksheet())) return;
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/payroll/transactions/pull-from-worksheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId: period.PeriodID, employeeType, companyCode: companyCode || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      // Detail lines may have changed for anyone already expanded — force a
      // re-fetch next time instead of showing stale cached Days/Amount.
      setPanelData({});
      setExpandedEmpCode(null);
      await refreshRows(period.PeriodID, companyCode);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(row: Row) {
    if (!(await confirmDeleteTransaction(`${row.EmpCode} — ${row.Employee.FullName}`))) return;
    setMessage(null);
    const res = await fetch(`/api/payroll/transactions/${row.TransactionID}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    if (expandedEmpCode === row.EmpCode) setExpandedEmpCode(null);
    if (period) await refreshRows(period.PeriodID, companyCode);
  }

  const existingCodes = new Set(rows.map((r) => r.EmpCode));
  const candidateEmployees = employees.filter((e) => e.EmployeeType === employeeType && (!companyCode || e.CompanyCode === companyCode) && !existingCodes.has(e.EmpCode));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          บริษัท
          <select value={companyCode} onChange={(e) => handleSelectCompany(e.target.value)} className="w-48 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900">
            <option value="">- ทั้งหมด -</option>
            {companies.map((c) => (
              <option key={c.CompanyCode} value={c.CompanyCode}>
                {c.CompanyName}
              </option>
            ))}
          </select>
        </label>
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
      </div>

      {employeeType && !period && <p className="text-sm text-red-600">ไม่มีงวดปัจจุบันสำหรับประเภทพนักงานนี้ — ไปตั้งค่าที่หน้า งวดการจ่าย</p>}
      {message && <p className="text-sm text-red-600">{message}</p>}

      {period && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <span className="text-gray-500">งวดปัจจุบัน: </span>
              <span className="font-medium">
                {period.PeriodMonth}/{toBuddhistYear(period.PeriodYear)} ({new Date(period.StartDate).toLocaleDateString("th-TH")} - {new Date(period.EndDate).toLocaleDateString("th-TH")})
              </span>
              {canReadLock && isLocked && (
                <span className="ml-2 font-medium text-green-700">
                  — ส่งขออนุมัติแล้ว (Locked) — แก้ไข/ลบ/ดึงข้อมูลจาก Worksheet ไม่ได้ ต้องตีคืนที่หน้า &quot;คำนวณเงินได้ประจำงวด&quot; ก่อน
                </span>
              )}
            </div>
            {canSave && !isLocked && (
              <button
                onClick={handlePullFromWorksheet}
                disabled={loading}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
              >
                ดึงข้อมูลจาก Worksheet
              </button>
            )}
          </div>

          {/* No overflow-x-auto here — same fix as the หน่วยงาน (Site)
              positions table (2026-09-21): this table's expanded row nests
              TransactionDetailPanel's "รายการ" SearchableSelect dropdown,
              and overflow-x-auto forces overflow-y to clip too (CSS spec),
              cutting the dropdown off before the user can click an option —
              reported as "กดเพิ่มรายการ ไม่ได้" but the real cause was never
              actually selecting a code, not the button itself. This table's
              columns are narrow enough that horizontal scroll isn't needed. */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">รหัสพนักงาน</th>
                  <th className="px-3 py-2 font-medium">ชื่อพนักงาน</th>
                  <th className="px-3 py-2 font-medium">แผนก</th>
                  <th className="px-3 py-2 font-medium">หน่วยงานต้นสังกัด</th>
                  <th className="px-3 py-2 font-medium text-right">จำนวนวันทำงานรวม</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isExpanded = expandedEmpCode === r.EmpCode;
                  // 2026-09-22: must match the SAME counting rule the user
                  // specified for pullPayrollFromWorksheet() itself (D=1,
                  // N=1, D-N=2, F=0 — HolidayDays never counted at all) —
                  // this column previously added HolidayDays in too, which
                  // made it disagree with the sum of the "ค่าแรง" detail
                  // lines it's meant to summarize (e.g. 16 shown here vs 14
                  // in the lines below, confusing the user into thinking the
                  // total was miscalculated when it was just counting a
                  // different thing).
                  const totalDays = Number(r.WorkDays) + Number(r.DoubleShiftDays) * 2;
                  return (
                    <Fragment key={r.TransactionID}>
                      <tr className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2">{r.EmpCode}</td>
                        <td className="px-3 py-2">{r.Employee.FullName}</td>
                        <td className="px-3 py-2">{r.Employee.Department?.DeptName ?? "-"}</td>
                        <td className="px-3 py-2">{r.Employee.Site?.SiteName ?? "-"}</td>
                        <td className="px-3 py-2 text-right">{totalDays}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => toggleExpand(r.EmpCode)} className="text-gray-500 hover:underline">
                              {isExpanded ? "▾ ซ่อน" : "▸ แก้ไข"}
                            </button>
                            {canDelete && !isLocked && (
                              <button onClick={() => handleDelete(r)} className="text-red-500 hover:underline">
                                ลบ
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && panelData[r.EmpCode] && (
                        <tr className="border-t border-gray-100 bg-gray-50">
                          <td colSpan={6} className="px-3 py-3">
                            <TransactionDetailPanel
                              empCode={r.EmpCode}
                              initialPeriod={panelData[r.EmpCode].period}
                              initialTransaction={panelData[r.EmpCode].transaction}
                              rateConfig={panelData[r.EmpCode].rateConfig}
                              incomeTypes={incomeTypes}
                              deductionTypes={deductionTypes}
                              canSave={canSave && !isLocked}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                      ยังไม่มีพนักงานในงวดนี้ตามเงื่อนไขที่เลือก
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {canSave && !isLocked && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 p-3">
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                เพิ่มพนักงานเข้างวดนี้
                <div className="w-72">
                  <SearchableSelect
                    value={addEmpCode}
                    onChange={setAddEmpCode}
                    options={candidateEmployees.map((e) => ({ code: e.EmpCode, label: `${e.EmpCode} — ${e.FullName}` }))}
                    placeholder="ค้นหารหัส/ชื่อพนักงาน"
                  />
                </div>
              </label>
              <button onClick={handleAddEmployee} disabled={loading || !addEmpCode} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
                + เพิ่มพนักงาน
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
