"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GENDER_VALUES, GENDER_LABELS, EDUCATION_LEVEL_VALUES, EDUCATION_LEVEL_LABELS } from "@/lib/validation";

interface Employee {
  EmpCode: string;
  IDCardNo: string;
  Address: string | null;
  BirthDate: string | null;
  IDCardIssuedBy: string | null;
  IDCardIssueDate: string | null;
  IDCardExpiryDate: string | null;
  IDCardAddress: string | null;
  PhoneNo: string | null;
  EmergencyContactName: string | null;
  EmergencyContactPhone: string | null;
  GuarantorName: string | null;
  BloodType: string | null;
  Height: string | null;
  Weight: string | null;
  BodyType: string | null;
  DistinguishingMarks: string | null;
  Gender: string | null;
  Religion: string | null;
  Ethnicity: string | null;
  Nationality: string | null;
  Education: string | null;
}

const inputCls = "rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100";

function toDateInputValue(value: string | null): string {
  if (!value) return "";
  return value.length >= 10 ? value.slice(0, 10) : value;
}

export default function PersonalInfoTab({ employee, canSave }: { employee: Employee; canSave: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({
    address: employee.Address ?? "",
    birthDate: toDateInputValue(employee.BirthDate),
    idCardIssuedBy: employee.IDCardIssuedBy ?? "",
    idCardIssueDate: toDateInputValue(employee.IDCardIssueDate),
    idCardExpiryDate: toDateInputValue(employee.IDCardExpiryDate),
    idCardAddress: employee.IDCardAddress ?? "",
    phoneNo: employee.PhoneNo ?? "",
    emergencyContactName: employee.EmergencyContactName ?? "",
    emergencyContactPhone: employee.EmergencyContactPhone ?? "",
    guarantorName: employee.GuarantorName ?? "",
    bloodType: employee.BloodType ?? "",
    height: employee.Height ?? "",
    weight: employee.Weight ?? "",
    bodyType: employee.BodyType ?? "",
    distinguishingMarks: employee.DistinguishingMarks ?? "",
    gender: employee.Gender ?? "",
    religion: employee.Religion ?? "",
    ethnicity: employee.Ethnicity ?? "",
    nationality: employee.Nationality ?? "",
    education: employee.Education ?? "",
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="เลขบัตรประชาชน">
          <input disabled value={employee.IDCardNo} className={inputCls} />
        </Field>
        <Field label="ออกให้โดย">
          <input disabled={!canSave} value={form.idCardIssuedBy} onChange={(e) => setForm({ ...form, idCardIssuedBy: e.target.value })} className={inputCls} />
        </Field>
        <Field label="วันที่ออกบัตร">
          <input disabled={!canSave} type="date" value={form.idCardIssueDate} onChange={(e) => setForm({ ...form, idCardIssueDate: e.target.value })} className={inputCls} />
        </Field>
        <Field label="วันที่หมดอายุบัตร">
          <input disabled={!canSave} type="date" value={form.idCardExpiryDate} onChange={(e) => setForm({ ...form, idCardExpiryDate: e.target.value })} className={inputCls} />
        </Field>
        <Field label="วันเกิด">
          <input disabled={!canSave} type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} className={inputCls} />
        </Field>
        <Field label="เบอร์โทร">
          <input disabled={!canSave} value={form.phoneNo} onChange={(e) => setForm({ ...form, phoneNo: e.target.value })} className={inputCls} />
        </Field>
        <Field label="ที่อยู่ตามบัตรประชาชน">
          <input disabled={!canSave} value={form.idCardAddress} onChange={(e) => setForm({ ...form, idCardAddress: e.target.value })} className={inputCls} />
        </Field>
        <Field label="ที่อยู่ปัจจุบัน">
          <input disabled={!canSave} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} />
        </Field>
        <Field label="เพศ">
          <select disabled={!canSave} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className={inputCls}>
            <option value="">- ไม่ระบุ -</option>
            {GENDER_VALUES.map((g) => (
              <option key={g} value={g}>
                {GENDER_LABELS[g]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="สัญชาติ">
          <input disabled={!canSave} value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} className={inputCls} />
        </Field>
        <Field label="เชื้อชาติ">
          <input disabled={!canSave} value={form.ethnicity} onChange={(e) => setForm({ ...form, ethnicity: e.target.value })} className={inputCls} />
        </Field>
        <Field label="ศาสนา">
          <input disabled={!canSave} value={form.religion} onChange={(e) => setForm({ ...form, religion: e.target.value })} className={inputCls} />
        </Field>
        <Field label="กลุ่มเลือด">
          <input disabled={!canSave} value={form.bloodType} onChange={(e) => setForm({ ...form, bloodType: e.target.value })} className={inputCls} />
        </Field>
        <Field label="ส่วนสูง (ซม.)">
          <input disabled={!canSave} type="number" step="0.1" value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} className={inputCls} />
        </Field>
        <Field label="น้ำหนัก (กก.)">
          <input disabled={!canSave} type="number" step="0.1" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} className={inputCls} />
        </Field>
        <Field label="รูปร่าง">
          <input disabled={!canSave} value={form.bodyType} onChange={(e) => setForm({ ...form, bodyType: e.target.value })} className={inputCls} />
        </Field>
        <Field label="ตำหนิ">
          <input disabled={!canSave} value={form.distinguishingMarks} onChange={(e) => setForm({ ...form, distinguishingMarks: e.target.value })} className={inputCls} />
        </Field>
        <Field label="วุฒิการศึกษา">
          <select disabled={!canSave} value={form.education} onChange={(e) => setForm({ ...form, education: e.target.value })} className={inputCls}>
            <option value="">- ไม่ระบุ -</option>
            {EDUCATION_LEVEL_VALUES.map((ed) => (
              <option key={ed} value={ed}>
                {EDUCATION_LEVEL_LABELS[ed]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ชื่อผู้ติดต่อฉุกเฉิน">
          <input disabled={!canSave} value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} className={inputCls} />
        </Field>
        <Field label="เบอร์โทรผู้ติดต่อฉุกเฉิน">
          <input disabled={!canSave} value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} className={inputCls} />
        </Field>
        <Field label="ชื่อผู้ค้ำประกัน">
          <input disabled={!canSave} value={form.guarantorName} onChange={(e) => setForm({ ...form, guarantorName: e.target.value })} className={inputCls} />
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
