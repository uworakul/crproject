"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { EMPLOYEE_TYPE_VALUES, EMPLOYEE_TYPE_LABELS } from "@/lib/validation";
import { toBuddhistYear } from "@/lib/buddhist-year";

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

// Company selection here is informational only, for context while picking a
// period — sys_period isn't scoped by company (one period covers every
// company's employees of that EmployeeType), so it doesn't filter or gate
// the close action itself, which always closes the whole period.
export default function PayrollClosingView({ periods, companies }: { periods: Period[]; companies: { CompanyCode: string; CompanyName: string }[] }) {
  const router = useRouter();
  const [companyCode, setCompanyCode] = useState("");
  const [employeeType, setEmployeeType] = useState("");
  const [lockInfo, setLockInfo] = useState<{ isLocked: boolean; employeeCount: number; totalNetPay: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const period = periods.find((p) => p.EmployeeType === employeeType && p.IsCurrent);

  async function handleSelectType(v: string) {
    setEmployeeType(v);
    setMessage(null);
    setLockInfo(null);
    const p = periods.find((pp) => pp.EmployeeType === v && pp.IsCurrent);
    if (p) {
      const res = await fetch(`/api/payroll/lock?periodId=${p.PeriodID}`);
      if (res.ok) {
        const body = await res.json();
        setLockInfo({ isLocked: body.isLocked, employeeCount: body.employeeCount, totalNetPay: body.totalNetPay });
      }
    }
  }

  async function handleClose() {
    if (!period) return;
    const result = await Swal.fire({
      title: "ยืนยันปิดสิ้นงวด",
      html: `งวด ${period.PeriodMonth}/${toBuddhistYear(period.PeriodYear)} (${EMPLOYEE_TYPE_LABELS[period.EmployeeType as keyof typeof EMPLOYEE_TYPE_LABELS] ?? period.EmployeeType})<br><strong class="text-red-600">การปิดงวดไม่สามารถย้อนกลับได้</strong>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "ยืนยันปิดสิ้นงวด",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#9ca3af",
    });
    if (!result.isConfirmed) return;

    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/payroll/closing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ periodId: period.PeriodID }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      await Swal.fire({ icon: "success", title: "ปิดสิ้นงวดสำเร็จ" });
      router.refresh();
      setEmployeeType("");
      setLockInfo(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          บริษัท
          <select value={companyCode} onChange={(e) => setCompanyCode(e.target.value)} className="w-48 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900">
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

      {employeeType && !period && <p className="text-sm text-red-600">ไม่มีงวดปัจจุบันสำหรับประเภทพนักงานนี้</p>}

      {period && lockInfo && (
        <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 text-sm">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <div className="text-gray-500">งวดที่จะปิด (งวดปัจจุบัน)</div>
              <div className="font-medium">
                {period.PeriodMonth}/{toBuddhistYear(period.PeriodYear)}
              </div>
            </div>
            <div>
              <div className="text-gray-500">ช่วงวันที่</div>
              <div>
                {new Date(period.StartDate).toLocaleDateString("th-TH")} - {new Date(period.EndDate).toLocaleDateString("th-TH")}
              </div>
            </div>
            <div>
              <div className="text-gray-500">จำนวนพนักงาน</div>
              <div>{lockInfo.employeeCount}</div>
            </div>
            <div>
              <div className="text-gray-500">ยอดสุทธิรวม</div>
              <div>{Number(lockInfo.totalNetPay).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
            </div>
          </div>

          {lockInfo.isLocked ? (
            <button onClick={handleClose} disabled={pending} className="w-fit rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50">
              ปิดสิ้นงวด
            </button>
          ) : (
            <p className="text-sm text-amber-600">งวดนี้ยังไม่ได้ส่งขออนุมัติ (Lock) — ต้อง Lock ก่อนจึงจะปิดสิ้นงวดได้ ไปที่หน้า &quot;คำนวณเงินได้ประจำงวด&quot;</p>
          )}
        </div>
      )}

      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
