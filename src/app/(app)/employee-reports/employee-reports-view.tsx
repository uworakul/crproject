"use client";

import { useState } from "react";
import { toBuddhistYear } from "@/lib/buddhist-year";
import SearchableSelect from "../searchable-select";

// 2026-09-23 — copied from src/app/(app)/payroll/reports/reports-view.tsx
// and trimmed down at the user's request: this page only ever hosts the
// "พนักงาน" report group (moved here from "รายงานการเงิน/หนี้ค้าง"), and
// none of those reports are period/month/year-scoped, so the whole
// scope-selector system (Period/periods prop, ประจำงวด/เดือน-ปี/ปีภาษี
// pickers) is dropped entirely rather than kept-but-unused. If a
// period/month/year-scoped report is ever added to this page later, port
// that machinery back from reports-view.tsx rather than rebuilding it.
interface ReportDef {
  key: string;
  label: string;
  groupable?: boolean;
}
const REPORTS: ReportDef[] = [
  { key: "employee-registry", label: "ทะเบียนพนักงาน", groupable: true },
  { key: "employee-card", label: "การ์ดพนักงาน" },
];

const GROUP_BY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "- ไม่จัดกลุ่ม -" },
  { value: "DEPT", label: "แผนก" },
  { value: "SITE", label: "หน่วยงาน" },
  { value: "BANK", label: "ธนาคาร" },
  { value: "EMPLOYEE_TYPE", label: "ประเภทพนักงาน" },
];

// การ์ดพนักงาน — 6 sections, matching the employee detail page's own tab
// names, each togglable per print run.
const CARD_SECTION_OPTIONS: { value: string; label: string }[] = [
  { value: "EMPLOYEE_INFO", label: "ข้อมูลพนักงาน" },
  { value: "PERSONAL_INFO", label: "ข้อมูลส่วนบุคคล" },
  { value: "WORK_EXPERIENCE", label: "ประวัติทำงาน" },
  { value: "TRAINING_EXPERIENCE", label: "ประวัติการฝึกอบรม" },
  { value: "LEAVE_HISTORY", label: "ประวัติการลาในปี" },
  { value: "TBOR7", label: "ธภ.7" },
];

export default function EmployeeReportsView({
  companies,
  departments,
  sites,
  banks,
  employees,
}: {
  companies: { CompanyCode: string; CompanyName: string }[];
  departments: { DeptCode: string; DeptName: string }[];
  sites: { SiteCode: string; SiteName: string }[];
  banks: { BankCode: string; BankNameTH: string }[];
  employees: { EmpCode: string; FullName: string }[];
}) {
  const [reportKey, setReportKey] = useState("employee-registry");
  const [employeeType, setEmployeeType] = useState("DAILY");
  const [companyCode, setCompanyCode] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [siteCode, setSiteCode] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [empCode, setEmpCode] = useState("");
  const [sortBy, setSortBy] = useState<"empCode" | "fullName">("empCode");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [groupBy, setGroupBy] = useState("");
  const [cardSections, setCardSections] = useState<Set<string>>(new Set(CARD_SECTION_OPTIONS.map((o) => o.value)));
  const [cardLeaveYear, setCardLeaveYear] = useState<number | "">(new Date().getFullYear());
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<"pdf" | "excel" | "preview" | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>("");

  const report = REPORTS.find((r) => r.key === reportKey)!;

  function toggleCardSection(value: string) {
    setCardSections((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function fetchReportBlob(format: "pdf" | "excel"): Promise<Blob | null> {
    setMessage(null);
    const params = new URLSearchParams({ format, employeeType });
    if (companyCode) params.set("companyCode", companyCode);
    if (deptCode) params.set("deptCode", deptCode);
    if (siteCode) params.set("siteCode", siteCode);
    if (bankCode) params.set("bankCode", bankCode);
    if (empCode) params.set("empCode", empCode);
    if (report.groupable) {
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);
      if (groupBy) params.set("groupBy", groupBy);
    }
    if (reportKey === "employee-card") {
      params.set("sections", [...cardSections].join(","));
      if (cardSections.has("LEAVE_HISTORY") && cardLeaveYear !== "") params.set("leaveYear", String(cardLeaveYear));
    }

    const res = await fetch(`/api/payroll/reports/${reportKey}?${params.toString()}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMessage(body.message || body.error);
      return null;
    }
    return res.blob();
  }

  function downloadBlob(blob: Blob, format: "pdf" | "excel") {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportKey}.${format === "pdf" ? "pdf" : "xlsx"}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function generate(format: "pdf" | "excel") {
    setPending(format);
    try {
      const blob = await fetchReportBlob(format);
      if (blob) downloadBlob(blob, format);
    } finally {
      setPending(null);
    }
  }

  async function openPreview() {
    setPending("preview");
    try {
      const blob = await fetchReportBlob("pdf");
      if (blob) {
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        setPreviewBlob(blob);
        setPreviewTitle(report.label);
      }
    } finally {
      setPending(null);
    }
  }

  function closePreview() {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewBlob(null);
  }

  const selectCls = "rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900";
  const availableYears = (() => {
    const years = new Set<number>([new Date().getFullYear()]);
    return [...years].sort((a, b) => b - a);
  })();

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded border border-gray-200 p-3">
        <label className="mb-1 block text-sm text-gray-600">ประเภทรายงาน</label>
        <select value={reportKey} onChange={(e) => setReportKey(e.target.value)} className={`${selectCls} w-80`}>
          {REPORTS.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 p-3">
        <div>
          <label className="mb-1 block text-xs text-gray-500">ประเภทพนักงาน</label>
          <select value={employeeType} onChange={(e) => setEmployeeType(e.target.value)} className={selectCls}>
            <option value="DAILY">รายวัน</option>
            <option value="MONTHLY">รายเดือน</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">บริษัท</label>
          <select value={companyCode} onChange={(e) => setCompanyCode(e.target.value)} className={selectCls}>
            <option value="">- ทั้งหมด -</option>
            {companies.map((c) => (
              <option key={c.CompanyCode} value={c.CompanyCode}>
                {c.CompanyName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">แผนก</label>
          <select value={deptCode} onChange={(e) => setDeptCode(e.target.value)} className={selectCls}>
            <option value="">- ทั้งหมด -</option>
            {departments.map((d) => (
              <option key={d.DeptCode} value={d.DeptCode}>
                {d.DeptName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">หน่วยงาน</label>
          <select value={siteCode} onChange={(e) => setSiteCode(e.target.value)} className={selectCls}>
            <option value="">- ทั้งหมด -</option>
            {sites.map((s) => (
              <option key={s.SiteCode} value={s.SiteCode}>
                {s.SiteName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">ธนาคาร</label>
          <select value={bankCode} onChange={(e) => setBankCode(e.target.value)} className={selectCls}>
            <option value="">- ทั้งหมด -</option>
            {banks.map((b) => (
              <option key={b.BankCode} value={b.BankCode}>
                {b.BankNameTH}
              </option>
            ))}
          </select>
        </div>
        <div className="w-64">
          <label className="mb-1 block text-xs text-gray-500">รหัสพนักงานเฉพาะราย (ไม่ระบุ = ทุกคน)</label>
          <SearchableSelect
            value={empCode}
            onChange={setEmpCode}
            options={employees.map((e) => ({ code: e.EmpCode, label: `${e.EmpCode} — ${e.FullName}` }))}
            placeholder="ค้นหารหัส/ชื่อพนักงาน (เว้นว่าง = ทั้งหมด)"
          />
        </div>
      </div>

      {report.groupable && (
        <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 p-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">เรียงลำดับตาม</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "empCode" | "fullName")} className={selectCls}>
              <option value="empCode">รหัสพนักงาน</option>
              <option value="fullName">ชื่อ-สกุล</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">ทิศทาง</label>
            <select value={sortDir} onChange={(e) => setSortDir(e.target.value as "asc" | "desc")} className={selectCls}>
              <option value="asc">น้อย → มาก</option>
              <option value="desc">มาก → น้อย</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">จัดกลุ่มตาม</label>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className={selectCls}>
              {GROUP_BY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {reportKey === "employee-card" && (
        <div className="flex flex-wrap items-start gap-4 rounded border border-gray-200 p-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">หัวข้อที่จะแสดง</label>
            <div className="flex flex-wrap gap-3">
              {CARD_SECTION_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-1 text-sm text-gray-700">
                  <input type="checkbox" checked={cardSections.has(o.value)} onChange={() => toggleCardSection(o.value)} />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
          {cardSections.has("LEAVE_HISTORY") && (
            <div>
              <label className="mb-1 block text-xs text-gray-500">ปีที่แสดงประวัติการลา (พ.ศ.)</label>
              <select value={cardLeaveYear} onChange={(e) => setCardLeaveYear(Number(e.target.value))} className={selectCls}>
                <option value="">- เลือกปี -</option>
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {toBuddhistYear(y)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button onClick={openPreview} disabled={pending !== null} className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
          {pending === "preview" ? "กำลังโหลด..." : "ดูตัวอย่าง (Preview)"}
        </button>
        <button onClick={() => generate("pdf")} disabled={pending !== null} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {pending === "pdf" ? "กำลังสร้าง..." : "ออกรายงาน PDF"}
        </button>
        <button onClick={() => generate("excel")} disabled={pending !== null} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {pending === "excel" ? "กำลังสร้าง..." : "ส่งออก Excel"}
        </button>
      </div>

      {message && <p className="text-sm text-red-600">{message}</p>}

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-4">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-medium text-gray-900">ตัวอย่างรายงาน: {previewTitle}</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => previewBlob && downloadBlob(previewBlob, "pdf")} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700">
                  ดาวน์โหลด PDF
                </button>
                <button onClick={() => generate("excel")} disabled={pending !== null} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  {pending === "excel" ? "กำลังสร้าง..." : "ส่งออก Excel"}
                </button>
                <button onClick={closePreview} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                  ปิด
                </button>
              </div>
            </div>
            <iframe src={previewUrl} title="report-preview" className="min-h-0 flex-1" />
          </div>
        </div>
      )}
    </div>
  );
}
