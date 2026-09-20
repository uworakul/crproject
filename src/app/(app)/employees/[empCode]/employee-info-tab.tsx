"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EMPLOYEE_TYPE_VALUES, EMPLOYEE_TYPE_LABELS, EMPLOYEE_STATUS_VALUES, EMPLOYEE_STATUS_LABELS } from "@/lib/validation";
import SearchableSelect from "../../searchable-select";
import { confirmDeleteEmployee } from "../confirm-delete-employee";

interface Employee {
  EmpCode: string;
  FullName: string;
  Title: string | null;
  FirstName: string | null;
  LastName: string | null;
  EmployeeStatus: string;
  StartDate: string;
  ResignDate: string | null;
  DeptCode: string | null;
  PositionCode: string | null;
  DefaultSiteCode: string | null;
  CompanyCode: string | null;
  EmployeeType: string;
  IsActive: boolean;
  ProbationPassDate: string | null;
  CertificateNo: string | null;
  ReferrerEmpCode: string | null;
  BlacklistCode: string | null;
  LicenseNo6: string | null;
  LicenseDate6: string | null;
  LicenseNo7: string | null;
  LicenseDate7: string | null;
}

const inputCls = "rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100";

function toDateInputValue(value: string | null): string {
  if (!value) return "";
  return value.length >= 10 ? value.slice(0, 10) : value;
}

export default function EmployeeInfoTab({
  employee,
  departments,
  positions,
  sites,
  companies,
  blacklist,
  canSave,
}: {
  employee: Employee;
  departments: { DeptCode: string; DeptName: string }[];
  positions: { PositionCode: string; PositionName: string }[];
  sites: { SiteCode: string; SiteName: string }[];
  companies: { CompanyCode: string; CompanyName: string }[];
  blacklist: { IDCardNo: string; FullName: string }[];
  canSave: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: employee.FullName,
    title: employee.Title ?? "",
    firstName: employee.FirstName ?? "",
    lastName: employee.LastName ?? "",
    employeeType: employee.EmployeeType,
    employeeStatus: employee.EmployeeStatus,
    deptCode: employee.DeptCode ?? "",
    positionCode: employee.PositionCode ?? "",
    defaultSiteCode: employee.DefaultSiteCode ?? "",
    companyCode: employee.CompanyCode ?? "",
    isActive: employee.IsActive,
    startDate: toDateInputValue(employee.StartDate),
    probationPassDate: toDateInputValue(employee.ProbationPassDate),
    resignDate: toDateInputValue(employee.ResignDate),
    certificateNo: employee.CertificateNo ?? "",
    referrerEmpCode: employee.ReferrerEmpCode ?? "",
    blacklistCode: employee.BlacklistCode ?? "",
    licenseNo6: employee.LicenseNo6 ?? "",
    licenseDate6: toDateInputValue(employee.LicenseDate6),
    licenseNo7: employee.LicenseNo7 ?? "",
    licenseDate7: toDateInputValue(employee.LicenseDate7),
  });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setMessage(null);
    setPending(true);
    try {
      // Title/First/Last still sync into FullName even though the display
      // field is no longer shown here — every other module in the app still
      // reads Employee.FullName directly for display purposes.
      const composedFullName =
        form.firstName || form.lastName ? [form.title, form.firstName, form.lastName].filter(Boolean).join(" ").trim() : form.fullName;

      const res = await fetch(`/api/employees/${employee.EmpCode}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          fullName: composedFullName,
          deptCode: form.deptCode || null,
          positionCode: form.positionCode || null,
          defaultSiteCode: form.defaultSiteCode || null,
          companyCode: form.companyCode || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      setMessage(res.ok ? "บันทึกแล้ว" : body.message || body.error);
      if (res.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    const reason = await confirmDeleteEmployee(employee.EmpCode, form.fullName || employee.FullName);
    if (!reason) return;
    setMessage(null);
    const res = await fetch(`/api/employees/${employee.EmpCode}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    router.push("/employees");
  }

  const isResigned = employee.EmployeeStatus === "RESIGNED";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3">
        <Field label="รหัสพนักงาน">
          <input disabled value={employee.EmpCode} className={inputCls} />
        </Field>
        <Field label="คำนำหน้า">
          <input disabled={!canSave} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} placeholder="นาย/นาง/นางสาว" />
        </Field>
        <Field label="ชื่อ">
          <input disabled={!canSave} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={inputCls} />
        </Field>
        <Field label="นามสกุล">
          <input disabled={!canSave} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={inputCls} />
        </Field>
        <Field label="สถานะพนักงาน">
          <select
            disabled={!canSave || isResigned}
            value={form.employeeStatus}
            onChange={(e) => setForm({ ...form, employeeStatus: e.target.value })}
            className={inputCls}
          >
            {EMPLOYEE_STATUS_VALUES.filter((s) => s !== "RESIGNED" || isResigned).map((s) => (
              <option key={s} value={s}>
                {EMPLOYEE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="บริษัท">
          <select disabled={!canSave} value={form.companyCode} onChange={(e) => setForm({ ...form, companyCode: e.target.value })} className={inputCls}>
            <option value="">- ไม่ระบุ -</option>
            {companies.map((c) => (
              <option key={c.CompanyCode} value={c.CompanyCode}>
                {c.CompanyName}
              </option>
            ))}
          </select>
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
          <select disabled={!canSave} value={form.positionCode} onChange={(e) => setForm({ ...form, positionCode: e.target.value })} className={inputCls}>
            <option value="">- ไม่ระบุ -</option>
            {positions.map((p) => (
              <option key={p.PositionCode} value={p.PositionCode}>
                {p.PositionName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="หน่วยงานต้นสังกัด (Site)">
          <SearchableSelect
            disabled={!canSave}
            value={form.defaultSiteCode}
            onChange={(code) => setForm({ ...form, defaultSiteCode: code })}
            options={sites.map((s) => ({ code: s.SiteCode, label: s.SiteName }))}
            placeholder="ค้นหาหน่วยงาน..."
          />
        </Field>
        <Field label="ประเภทพนักงาน">
          <select disabled={!canSave} value={form.employeeType} onChange={(e) => setForm({ ...form, employeeType: e.target.value })} className={inputCls}>
            {EMPLOYEE_TYPE_VALUES.map((t) => (
              <option key={t} value={t}>
                {EMPLOYEE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="วันเริ่มงาน">
          <input disabled={!canSave} type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={inputCls} />
        </Field>
        <Field label="วันที่ผ่านงาน">
          <input disabled={!canSave} type="date" value={form.probationPassDate} onChange={(e) => setForm({ ...form, probationPassDate: e.target.value })} className={inputCls} />
        </Field>
        <Field label="วันที่ลาออก">
          <input disabled={!canSave} type="date" value={form.resignDate} onChange={(e) => setForm({ ...form, resignDate: e.target.value })} className={inputCls} />
        </Field>
        <Field label="รหัสแบล็คลิส">
          <select disabled={!canSave} value={form.blacklistCode} onChange={(e) => setForm({ ...form, blacklistCode: e.target.value })} className={inputCls}>
            <option value="">- ไม่ระบุ -</option>
            {blacklist.map((b) => (
              <option key={b.IDCardNo} value={b.IDCardNo}>
                {b.IDCardNo} — {b.FullName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="เลขที่ประกาศพ้นหน้าที่">
          <input disabled={!canSave} value={form.certificateNo} onChange={(e) => setForm({ ...form, certificateNo: e.target.value })} className={inputCls} />
        </Field>
        <Field label="เลขที่ใบอนุญาต ธภ.6">
          <input disabled={!canSave} value={form.licenseNo6} onChange={(e) => setForm({ ...form, licenseNo6: e.target.value })} className={inputCls} />
        </Field>
        <Field label="ลงวันที่ ธภ.6">
          <input disabled={!canSave} type="date" value={form.licenseDate6} onChange={(e) => setForm({ ...form, licenseDate6: e.target.value })} className={inputCls} />
        </Field>
        <Field label="เลขที่ใบอนุญาต ธภ.7">
          <input disabled={!canSave} value={form.licenseNo7} onChange={(e) => setForm({ ...form, licenseNo7: e.target.value })} className={inputCls} />
        </Field>
        <Field label="ลงวันที่ ธภ.7">
          <input disabled={!canSave} type="date" value={form.licenseDate7} onChange={(e) => setForm({ ...form, licenseDate7: e.target.value })} className={inputCls} />
        </Field>
        <Field label="รหัสคนแนะนำ">
          <input disabled={!canSave} value={form.referrerEmpCode} onChange={(e) => setForm({ ...form, referrerEmpCode: e.target.value })} className={inputCls} />
        </Field>
      </div>

      {canSave && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!form.isActive} onChange={(e) => setForm({ ...form, isActive: !e.target.checked })} />
          ระงับการจ่ายเงิน (ใช้สำหรับแก้ไขข้อมูลผิดพลาด ไม่ใช่การลาออก)
        </label>
      )}

      {canSave && (
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={pending} className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
            {pending ? "กำลังบันทึก..." : "บันทึก"}
          </button>
          <button onClick={handleDelete} className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
            ลบออกจากระบบ
          </button>
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
