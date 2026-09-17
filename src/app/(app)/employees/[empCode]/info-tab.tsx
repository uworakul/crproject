"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EMPLOYEE_TYPE_VALUES, EMPLOYEE_TYPE_LABELS } from "@/lib/validation";

interface Employee {
  EmpCode: string;
  IDCardNo: string;
  FullName: string;
  Address: string | null;
  EmployeeStatus: string;
  StartDate: string;
  ResignDate: string | null;
  DeptCode: string | null;
  PositionCode: string | null;
  DefaultSiteCode: string | null;
  EmployeeType: string;
  BankCode: string | null;
  BankAccountNo: string | null;
  DailyRate: string | null;
  IsActive: boolean;
}

const inputCls = "rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100";

export default function InfoTab({
  employee,
  departments,
  positions,
  sites,
  banks,
  canSave,
}: {
  employee: Employee;
  departments: { DeptCode: string; DeptName: string }[];
  positions: { PositionCode: string; PositionName: string }[];
  sites: { SiteCode: string; SiteName: string }[];
  banks: { BankCode: string; BankNameTH: string }[];
  canSave: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: employee.FullName,
    address: employee.Address ?? "",
    employeeType: employee.EmployeeType,
    deptCode: employee.DeptCode ?? "",
    positionCode: employee.PositionCode ?? "",
    defaultSiteCode: employee.DefaultSiteCode ?? "",
    bankCode: employee.BankCode ?? "",
    bankAccountNo: employee.BankAccountNo ?? "",
    dailyRate: employee.DailyRate ?? "",
    isActive: employee.IsActive,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch(`/api/employees/${employee.EmpCode}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          deptCode: form.deptCode || null,
          positionCode: form.positionCode || null,
          defaultSiteCode: form.defaultSiteCode || null,
          bankCode: form.bankCode || null,
          dailyRate: form.dailyRate || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      setMessage(res.ok ? "บันทึกแล้ว" : body.message || body.error);
      if (res.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function resign() {
    setMessage(null);
    const res = await fetch(`/api/employees/${employee.EmpCode}/resign`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? "บันทึกการลาออกแล้ว" : body.message || body.error);
    if (res.ok) router.refresh();
  }

  const isResigned = employee.EmployeeStatus === "RESIGNED";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="เลขบัตรประชาชน">
          <input disabled value={employee.IDCardNo} className={inputCls} />
        </Field>
        <Field label="วันเริ่มงาน">
          <input disabled value={new Date(employee.StartDate).toLocaleDateString("th-TH")} className={inputCls} />
        </Field>
        <Field label="ชื่อ-นามสกุล">
          <input disabled={!canSave} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={inputCls} />
        </Field>
        <Field label="ที่อยู่">
          <input disabled={!canSave} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} />
        </Field>
        <Field label="ประเภทพนักงาน">
          <select
            disabled={!canSave}
            value={form.employeeType}
            onChange={(e) => setForm({ ...form, employeeType: e.target.value })}
            className={inputCls}
          >
            {EMPLOYEE_TYPE_VALUES.map((t) => (
              <option key={t} value={t}>
                {EMPLOYEE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ค่าแรง/วัน (บาท)">
          <input
            disabled={!canSave}
            type="number"
            step="0.01"
            value={form.dailyRate}
            onChange={(e) => setForm({ ...form, dailyRate: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="แผนก">
          <select disabled={!canSave} value={form.deptCode} onChange={(e) => setForm({ ...form, deptCode: e.target.value })} className={inputCls}>
            <option value="">- ไม่ระบุ -</option>
            {departments.map((d) => (
              <option key={d.DeptCode} value={d.DeptCode}>
                {d.DeptName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ตำแหน่ง">
          <select
            disabled={!canSave}
            value={form.positionCode}
            onChange={(e) => setForm({ ...form, positionCode: e.target.value })}
            className={inputCls}
          >
            <option value="">- ไม่ระบุ -</option>
            {positions.map((p) => (
              <option key={p.PositionCode} value={p.PositionCode}>
                {p.PositionName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="หน่วยงานหลัก (Site)">
          <select
            disabled={!canSave}
            value={form.defaultSiteCode}
            onChange={(e) => setForm({ ...form, defaultSiteCode: e.target.value })}
            className={inputCls}
          >
            <option value="">- ไม่ระบุ -</option>
            {sites.map((s) => (
              <option key={s.SiteCode} value={s.SiteCode}>
                {s.SiteName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ธนาคาร">
          <select disabled={!canSave} value={form.bankCode} onChange={(e) => setForm({ ...form, bankCode: e.target.value })} className={inputCls}>
            <option value="">- ไม่ระบุ -</option>
            {banks.map((b) => (
              <option key={b.BankCode} value={b.BankCode}>
                {b.BankNameTH}
              </option>
            ))}
          </select>
        </Field>
        <Field label="เลขบัญชีธนาคาร">
          <input
            disabled={!canSave}
            value={form.bankAccountNo}
            onChange={(e) => setForm({ ...form, bankAccountNo: e.target.value })}
            className={inputCls}
          />
        </Field>
      </div>

      {canSave && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          ใช้งานอยู่ (ยกเลิกติ๊กเพื่อระงับ — ใช้สำหรับแก้ไขข้อมูลผิดพลาด ไม่ใช่การลาออก)
        </label>
      )}

      {canSave && (
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={pending} className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
            {pending ? "กำลังบันทึก..." : "บันทึก"}
          </button>
          {!isResigned && (
            <button onClick={resign} className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
              บันทึกลาออก
            </button>
          )}
          {isResigned && (
            <span className="text-sm text-gray-500">
              ลาออกแล้วเมื่อ {employee.ResignDate ? new Date(employee.ResignDate).toLocaleDateString("th-TH") : "-"}
            </span>
          )}
        </div>
      )}

      {message && <p className="text-sm text-gray-600">{message}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-gray-600">{label}</span>
      {children}
    </label>
  );
}
