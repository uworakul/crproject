"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EMPLOYEE_TYPE_VALUES, EMPLOYEE_TYPE_LABELS } from "@/lib/validation";

interface Option {
  code: string;
  name: string;
}

export default function NewEmployeePage() {
  const router = useRouter();
  const [departments, setDepartments] = useState<Option[]>([]);
  const [positions, setPositions] = useState<Option[]>([]);
  const [banks, setBanks] = useState<Option[]>([]);
  const [sites, setSites] = useState<Option[]>([]);
  const [form, setForm] = useState({
    empCode: "",
    idCardNo: "",
    fullName: "",
    address: "",
    startDate: "",
    employeeType: "" as string,
    deptCode: "",
    positionCode: "",
    defaultSiteCode: "",
    bankCode: "",
    bankAccountNo: "",
    dailyRate: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch("/api/reference/departments")
      .then((r) => r.json())
      .then((rows) => setDepartments(rows.map((d: { DeptCode: string; DeptName: string }) => ({ code: d.DeptCode, name: d.DeptName }))))
      .catch(() => {});
    fetch("/api/reference/positions")
      .then((r) => r.json())
      .then((rows) =>
        setPositions(rows.map((p: { PositionCode: string; PositionName: string }) => ({ code: p.PositionCode, name: p.PositionName }))),
      )
      .catch(() => {});
    fetch("/api/reference/banks")
      .then((r) => r.json())
      .then((rows) => setBanks(rows.map((b: { BankCode: string; BankNameTH: string }) => ({ code: b.BankCode, name: b.BankNameTH }))))
      .catch(() => {});
    fetch("/api/sites")
      .then((r) => r.json())
      .then((rows) => setSites(rows.map((s: { SiteCode: string; SiteName: string }) => ({ code: s.SiteCode, name: s.SiteName }))))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
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
      if (!res.ok) {
        setError(body.message || body.error || "เพิ่มพนักงานไม่สำเร็จ");
        return;
      }
      router.push(`/employees/${form.empCode}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg p-8">
      <Link href="/employees" className="text-sm text-gray-500 hover:underline">
        ← กลับทะเบียนพนักงาน
      </Link>
      <h1 className="mb-6 mt-2 text-lg font-semibold text-gray-900">เพิ่มพนักงานใหม่</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="รหัสพนักงาน">
          <input required value={form.empCode} onChange={(e) => setForm({ ...form, empCode: e.target.value })} className={inputCls} />
        </Field>
        <Field label="เลขบัตรประชาชน">
          <input required value={form.idCardNo} onChange={(e) => setForm({ ...form, idCardNo: e.target.value })} className={inputCls} />
        </Field>
        <Field label="ชื่อ-นามสกุล">
          <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={inputCls} />
        </Field>
        <Field label="ที่อยู่">
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} />
        </Field>
        <Field label="วันเริ่มงาน">
          <input
            required
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="ประเภทพนักงาน">
          <select required value={form.employeeType} onChange={(e) => setForm({ ...form, employeeType: e.target.value })} className={inputCls}>
            <option value="" disabled>
              เลือกประเภท
            </option>
            {EMPLOYEE_TYPE_VALUES.map((t) => (
              <option key={t} value={t}>
                {EMPLOYEE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="แผนก">
          <select value={form.deptCode} onChange={(e) => setForm({ ...form, deptCode: e.target.value })} className={inputCls}>
            <option value="">- ไม่ระบุ -</option>
            {departments.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ตำแหน่ง">
          <select value={form.positionCode} onChange={(e) => setForm({ ...form, positionCode: e.target.value })} className={inputCls}>
            <option value="">- ไม่ระบุ -</option>
            {positions.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="หน่วยงานหลัก (Site)">
          <select value={form.defaultSiteCode} onChange={(e) => setForm({ ...form, defaultSiteCode: e.target.value })} className={inputCls}>
            <option value="">- ไม่ระบุ -</option>
            {sites.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ค่าแรง/วัน (บาท)">
          <input
            type="number"
            step="0.01"
            value={form.dailyRate}
            onChange={(e) => setForm({ ...form, dailyRate: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="ธนาคาร">
          <select value={form.bankCode} onChange={(e) => setForm({ ...form, bankCode: e.target.value })} className={inputCls}>
            <option value="">- ไม่ระบุ -</option>
            {banks.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="เลขบัญชีธนาคาร">
          <input value={form.bankAccountNo} onChange={(e) => setForm({ ...form, bankAccountNo: e.target.value })} className={inputCls} />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก..." : "เพิ่มพนักงาน"}
        </button>
      </form>
    </div>
  );
}

const inputCls = "rounded border border-gray-300 px-3 py-2 text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-gray-600">{label}</span>
      {children}
    </label>
  );
}
