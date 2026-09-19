"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Employee {
  EmpCode: string;
  DailyRate: string | null;
  OTRatePerDay: string | null;
  MonthlySalary: string | null;
  EmployeePositionAllowance: string | null;
  BankCode: string | null;
  BankAccountNo: string | null;
}

const inputCls = "rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100";

export default function IncomeTab({
  employee,
  banks,
  canSave,
}: {
  employee: Employee;
  banks: { BankCode: string; BankNameTH: string }[];
  canSave: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    dailyRate: employee.DailyRate ?? "",
    otRatePerDay: employee.OTRatePerDay ?? "",
    monthlySalary: employee.MonthlySalary ?? "",
    employeePositionAllowance: employee.EmployeePositionAllowance ?? "",
    bankCode: employee.BankCode ?? "",
    bankAccountNo: employee.BankAccountNo ?? "",
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
        body: JSON.stringify({ ...form, dailyRate: form.dailyRate || null, bankCode: form.bankCode || null }),
      });
      const body = await res.json().catch(() => ({}));
      setMessage(res.ok ? "บันทึกแล้ว" : body.message || body.error);
      if (res.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3">
        <Field label="ค่าแรงต่อวัน (บาท)">
          <input disabled={!canSave} type="number" step="0.01" value={form.dailyRate} onChange={(e) => setForm({ ...form, dailyRate: e.target.value })} className={inputCls} />
        </Field>
        <Field label="ค่า OT ต่อวัน (บาท)">
          <input disabled={!canSave} type="number" step="0.01" value={form.otRatePerDay} onChange={(e) => setForm({ ...form, otRatePerDay: e.target.value })} className={inputCls} />
        </Field>
        <Field label="เงินเดือน (บาท)">
          <input disabled={!canSave} type="number" step="0.01" value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} className={inputCls} />
        </Field>
        <Field label="ค่าตำแหน่ง (บาท)">
          <input
            disabled={!canSave}
            type="number"
            step="0.01"
            value={form.employeePositionAllowance}
            onChange={(e) => setForm({ ...form, employeePositionAllowance: e.target.value })}
            className={inputCls}
          />
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
          <input disabled={!canSave} value={form.bankAccountNo} onChange={(e) => setForm({ ...form, bankAccountNo: e.target.value })} className={inputCls} />
        </Field>
      </div>

      {canSave && (
        <div>
          <button onClick={save} disabled={pending} className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
            {pending ? "กำลังบันทึก..." : "บันทึก"}
          </button>
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
