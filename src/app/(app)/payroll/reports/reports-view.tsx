"use client";

import { useMemo, useState } from "react";
import { toBuddhistYear } from "@/lib/buddhist-year";
import SearchableSelect from "../../searchable-select";

interface Period {
  PeriodID: number;
  EmployeeType: string;
  PeriodYear: number;
  PeriodMonth: number;
  StartDate: string;
  EndDate: string;
}

// 14 reports across 3 groups, matching how the user's own list was
// organized. scope decides which extra selector shows: "period" needs
// "ประจำงวด" (a specific sys_period row), "month" needs ปี+เดือน (สปส 1-10 /
// ภงด.1 — filed MONTHLY by the government even though DAILY payroll can run
// semi-monthly, so a bare periodId isn't the right unit), "year" needs just
// ปี (the two annual reports), "none" ignores period/year/month entirely.
// groupable flags the "flat table" reports that get the Sort by/Group by +
// subtotal/grand-total controls (2026-09-23) — Payslip is a per-person card
// layout, not a table, and dept/site-summary are matrix reports already
// grouped by definition, so those three aren't groupable.
//
// The "พนักงาน" group (ทะเบียนพนักงาน/การ์ดพนักงาน) moved OUT of this page
// (2026-09-23) to its own top-level menu/page — see
// src/app/(app)/employee-reports/. Both report_keys and their API branches
// are unchanged; only this page's own catalogue no longer lists them.
type ReportScope = "period" | "month" | "year" | "none";
interface ReportDef {
  key: string;
  label: string;
  scope: ReportScope;
  groupable?: boolean;
}
const REPORT_GROUPS: { label: string; reports: ReportDef[] }[] = [
  {
    label: "เงินเดือน",
    reports: [
      { key: "payslip", label: "Payslip", scope: "period" },
      { key: "bank-remit", label: "รายงานนำส่งธนาคาร", scope: "period", groupable: true },
      { key: "dept-summary", label: "สรุปการจ่ายแยกประเภท ตามแผนก", scope: "period" },
      { key: "site-summary", label: "สรุปการจ่ายแยกประเภท ตามหน่วยงาน", scope: "period" },
    ],
  },
  {
    label: "หนี้ค้าง",
    reports: [
      { key: "debt-advance", label: "รายงานหนี้ค้างเงินเบิกต่างๆ", scope: "none", groupable: true },
      { key: "debt-training", label: "รายงานหนี้ค้างค่าอบรม", scope: "none", groupable: true },
      { key: "debt-insurance", label: "รายงานหนี้ค้างเงินประกัน", scope: "none", groupable: true },
      { key: "debt-loan", label: "รายงานหนี้ค้างเงินกู้", scope: "none", groupable: true },
    ],
  },
  {
    label: "หน่วยงานภาครัฐ",
    reports: [
      { key: "sso-remit", label: "รายงาน สปส 1-10", scope: "month", groupable: true },
      { key: "sso-remit-check", label: "รายงาน สปส 1-10 (ตรวจสอบ)", scope: "period", groupable: true },
      { key: "withholding-tax", label: "รายงาน ภงด 1", scope: "month", groupable: true },
      { key: "withholding-tax-annual", label: "รายงาน ภงด 1 ก", scope: "year", groupable: true },
      { key: "tax-certificate-50bis", label: "รายงาน หนังสือรับรองการหักภาษี 50ทวิ", scope: "year", groupable: true },
      { key: "welfare-fund-remit", label: "รายงาน สรุปยอดสงเคราะห์พนักงาน", scope: "period", groupable: true },
    ],
  },
];
const ALL_REPORTS = REPORT_GROUPS.flatMap((g) => g.reports);

const GROUP_BY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "- ไม่จัดกลุ่ม -" },
  { value: "DEPT", label: "แผนก" },
  { value: "SITE", label: "หน่วยงาน" },
  { value: "BANK", label: "ธนาคาร" },
  { value: "EMPLOYEE_TYPE", label: "ประเภทพนักงาน" },
];

// การ์ดพนักงาน (2026-09-23) — 6 sections, matching the employee detail
// page's own tab names, each togglable per print run.
const CARD_SECTION_OPTIONS: { value: string; label: string }[] = [
  { value: "EMPLOYEE_INFO", label: "ข้อมูลพนักงาน" },
  { value: "PERSONAL_INFO", label: "ข้อมูลส่วนบุคคล" },
  { value: "WORK_EXPERIENCE", label: "ประวัติทำงาน" },
  { value: "TRAINING_EXPERIENCE", label: "ประวัติการฝึกอบรม" },
  { value: "LEAVE_HISTORY", label: "ประวัติการลาในปี" },
  { value: "TBOR7", label: "ธภ.7" },
];

export default function ReportsView({
  periods,
  companies,
  departments,
  sites,
  banks,
  employees,
}: {
  periods: Period[];
  companies: { CompanyCode: string; CompanyName: string }[];
  departments: { DeptCode: string; DeptName: string }[];
  sites: { SiteCode: string; SiteName: string }[];
  banks: { BankCode: string; BankNameTH: string }[];
  employees: { EmpCode: string; FullName: string }[];
}) {
  const [groupLabel, setGroupLabel] = useState(REPORT_GROUPS[0].label);
  const [reportKey, setReportKey] = useState("payslip");
  const [employeeType, setEmployeeType] = useState("DAILY");
  const [periodId, setPeriodId] = useState<number | "">("");
  const [year, setYear] = useState<number | "">("");
  const [month, setMonth] = useState<number | "">("");
  const [companyCode, setCompanyCode] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [siteCode, setSiteCode] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [empCode, setEmpCode] = useState("");
  const [sortBy, setSortBy] = useState<"empCode" | "fullName">("empCode");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [groupBy, setGroupBy] = useState("");
  const [cardSections, setCardSections] = useState<Set<string>>(new Set(CARD_SECTION_OPTIONS.map((o) => o.value)));
  const [cardLeaveYear, setCardLeaveYear] = useState<number | "">("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<"pdf" | "excel" | "preview" | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>("");

  const currentGroup = REPORT_GROUPS.find((g) => g.label === groupLabel)!;
  const report = ALL_REPORTS.find((r) => r.key === reportKey)!;
  const matchingPeriods = useMemo(() => periods.filter((p) => p.EmployeeType === employeeType), [periods, employeeType]);
  // Years available for the year/month-scoped reports — every distinct
  // PeriodYear on file plus the current Gregorian year (so a fresh install
  // with no periods yet still offers something to pick), newest first.
  const availableYears = useMemo(() => {
    const years = new Set(periods.map((p) => p.PeriodYear));
    years.add(new Date().getFullYear());
    return [...years].sort((a, b) => b - a);
  }, [periods]);
  // (year, month) combos that actually have a sys_period — avoids offering
  // a calendar month with zero payroll data for สปส 1-10 / ภงด.1.
  const availableMonths = useMemo(() => {
    const seen = new Map<string, { year: number; month: number }>();
    for (const p of periods) {
      const key = `${p.PeriodYear}-${p.PeriodMonth}`;
      if (!seen.has(key)) seen.set(key, { year: p.PeriodYear, month: p.PeriodMonth });
    }
    return [...seen.values()].sort((a, b) => b.year - a.year || b.month - a.month);
  }, [periods]);

  function selectGroup(label: string) {
    setGroupLabel(label);
    const g = REPORT_GROUPS.find((x) => x.label === label)!;
    selectReport(g.reports[0].key);
  }

  function selectReport(key: string) {
    setReportKey(key);
    const next = ALL_REPORTS.find((r) => r.key === key)!;
    if (next.scope === "period" && periodId === "") {
      const first = periods.find((p) => p.EmployeeType === employeeType);
      if (first) setPeriodId(first.PeriodID);
    }
    if (next.scope === "year" && year === "") setYear(availableYears[0]);
    if (next.scope === "month" && (year === "" || month === "") && availableMonths[0]) {
      setYear(availableMonths[0].year);
      setMonth(availableMonths[0].month);
    }
    if (key === "employee-card" && cardLeaveYear === "") setCardLeaveYear(new Date().getFullYear());
  }

  function toggleCardSection(value: string) {
    setCardSections((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function fetchReportBlob(format: "pdf" | "excel"): Promise<Blob | null> {
    if (report.scope === "period" && periodId === "") {
      setMessage("กรุณาเลือกงวดก่อน");
      return null;
    }
    if (report.scope === "year" && year === "") {
      setMessage("กรุณาเลือกปีก่อน");
      return null;
    }
    if (report.scope === "month" && (year === "" || month === "")) {
      setMessage("กรุณาเลือกเดือนก่อน");
      return null;
    }
    setMessage(null);
    const params = new URLSearchParams({ format });
    if (report.scope === "period" && periodId !== "") params.set("periodId", String(periodId));
    if ((report.scope === "year" || report.scope === "month") && year !== "") params.set("year", String(year));
    if (report.scope === "month" && month !== "") params.set("month", String(month));
    if (companyCode) params.set("companyCode", companyCode);
    if (deptCode) params.set("deptCode", deptCode);
    if (siteCode) params.set("siteCode", siteCode);
    if (bankCode) params.set("bankCode", bankCode);
    if (empCode) params.set("empCode", empCode);
    if (report.scope !== "period") params.set("employeeType", employeeType);
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 p-3">
        <div>
          <label className="mb-1 block text-sm text-gray-600">กลุ่มรายงาน</label>
          <select value={groupLabel} onChange={(e) => selectGroup(e.target.value)} className={`${selectCls} w-56`}>
            {REPORT_GROUPS.map((g) => (
              <option key={g.label} value={g.label}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600">ประเภทรายงาน</label>
          <select value={reportKey} onChange={(e) => selectReport(e.target.value)} className={`${selectCls} w-80`}>
            {currentGroup.reports.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 p-3">
        <div>
          <label className="mb-1 block text-xs text-gray-500">ประเภทพนักงาน</label>
          <select
            value={employeeType}
            onChange={(e) => {
              setEmployeeType(e.target.value);
              setPeriodId("");
            }}
            className={selectCls}
          >
            <option value="DAILY">รายวัน</option>
            <option value="MONTHLY">รายเดือน</option>
          </select>
        </div>

        {report.scope === "period" && (
          <div>
            <label className="mb-1 block text-xs text-gray-500">ประจำงวด</label>
            <select value={periodId} onChange={(e) => setPeriodId(Number(e.target.value))} className={selectCls}>
              <option value="">- เลือกงวด -</option>
              {matchingPeriods.map((p) => (
                <option key={p.PeriodID} value={p.PeriodID}>
                  {p.PeriodMonth}/{toBuddhistYear(p.PeriodYear)} ({p.StartDate.slice(0, 10)} - {p.EndDate.slice(0, 10)})
                </option>
              ))}
            </select>
          </div>
        )}

        {report.scope === "month" && (
          <div>
            <label className="mb-1 block text-xs text-gray-500">เดือน/ปี (พ.ศ.)</label>
            <select
              value={year !== "" && month !== "" ? `${year}-${month}` : ""}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-").map(Number);
                setYear(y);
                setMonth(m);
              }}
              className={selectCls}
            >
              <option value="">- เลือกเดือน -</option>
              {availableMonths.map((m) => (
                <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
                  {m.month}/{toBuddhistYear(m.year)}
                </option>
              ))}
            </select>
          </div>
        )}

        {report.scope === "year" && (
          <div>
            <label className="mb-1 block text-xs text-gray-500">ปีภาษี (พ.ศ.)</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectCls}>
              <option value="">- เลือกปี -</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {toBuddhistYear(y)}
                </option>
              ))}
            </select>
          </div>
        )}

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
