"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MARITAL_STATUS_VALUES, MARITAL_STATUS_LABELS } from "@/lib/validation";

interface Employee {
  EmpCode: string;
  MaritalStatus: string | null;
  ChildrenCount: number | null;
  ParentSupportAmount: string | null;
  LifeInsurancePremium: string | null;
  HealthInsurancePremium: string | null;
  ParentHealthInsurancePremium: string | null;
  RMFPurchaseAmount: string | null;
  HomeLoanInterestAmount: string | null;
  DonationAmount: string | null;
}

const inputCls = "rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100";

export default function TaxDeductionTab({ employee, canSave }: { employee: Employee; canSave: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({
    maritalStatus: employee.MaritalStatus ?? "",
    childrenCount: employee.ChildrenCount ?? 0,
    parentSupportAmount: employee.ParentSupportAmount ?? "",
    lifeInsurancePremium: employee.LifeInsurancePremium ?? "",
    healthInsurancePremium: employee.HealthInsurancePremium ?? "",
    parentHealthInsurancePremium: employee.ParentHealthInsurancePremium ?? "",
    rmfPurchaseAmount: employee.RMFPurchaseAmount ?? "",
    homeLoanInterestAmount: employee.HomeLoanInterestAmount ?? "",
    donationAmount: employee.DonationAmount ?? "",
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
        body: JSON.stringify(form),
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
      <p className="text-xs text-gray-400">เก็บไว้เป็นข้อมูลอ้างอิง ยังไม่ถูกนำไปคำนวณภาษีหัก ณ ที่จ่ายอัตโนมัติ</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="สถานภาพสมรส">
          <select disabled={!canSave} value={form.maritalStatus} onChange={(e) => setForm({ ...form, maritalStatus: e.target.value })} className={inputCls}>
            <option value="">- ไม่ระบุ -</option>
            {MARITAL_STATUS_VALUES.map((m) => (
              <option key={m} value={m}>
                {MARITAL_STATUS_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="จำนวนบุตร">
          <input
            disabled={!canSave}
            type="number"
            min={0}
            value={form.childrenCount}
            onChange={(e) => setForm({ ...form, childrenCount: Number(e.target.value) })}
            className={inputCls}
          />
        </Field>
        <Field label="อุปการะบิดามารดา (บาท)">
          <input
            disabled={!canSave}
            type="number"
            step="0.01"
            value={form.parentSupportAmount}
            onChange={(e) => setForm({ ...form, parentSupportAmount: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="เบี้ยประกันชีวิต (บาท)">
          <input
            disabled={!canSave}
            type="number"
            step="0.01"
            value={form.lifeInsurancePremium}
            onChange={(e) => setForm({ ...form, lifeInsurancePremium: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="เบี้ยประกันสุขภาพ (บาท)">
          <input
            disabled={!canSave}
            type="number"
            step="0.01"
            value={form.healthInsurancePremium}
            onChange={(e) => setForm({ ...form, healthInsurancePremium: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="เบี้ยประกันสุขภาพบิดามารดา (บาท)">
          <input
            disabled={!canSave}
            type="number"
            step="0.01"
            value={form.parentHealthInsurancePremium}
            onChange={(e) => setForm({ ...form, parentHealthInsurancePremium: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="ยอดซื้อกองทุน RMF ในปี (บาท)">
          <input
            disabled={!canSave}
            type="number"
            step="0.01"
            value={form.rmfPurchaseAmount}
            onChange={(e) => setForm({ ...form, rmfPurchaseAmount: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="ยอดดอกเบี้ยบ้าน (บาท)">
          <input
            disabled={!canSave}
            type="number"
            step="0.01"
            value={form.homeLoanInterestAmount}
            onChange={(e) => setForm({ ...form, homeLoanInterestAmount: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="ยอดเงินบริจาค (บาท)">
          <input
            disabled={!canSave}
            type="number"
            step="0.01"
            value={form.donationAmount}
            onChange={(e) => setForm({ ...form, donationAmount: e.target.value })}
            className={inputCls}
          />
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
