"use client";

import { useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { toBuddhistYear, toGregorianYear } from "@/lib/buddhist-year";
import SearchableSelect from "../searchable-select";

async function confirmDialog(html: string, confirmButtonColor = "#dc2626") {
  const result = await Swal.fire({
    html,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor,
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

interface Site {
  SiteCode: string;
  SiteName: string;
}
interface AttendanceCode {
  Code: string;
  CodeNameTH: string;
  PayMultiplier: string;
}
interface DayCell {
  day: number;
  attendCode: string | null;
}
interface DetailRow {
  worksheetDetailId: number;
  empCode: string;
  empName: string;
  empType: string;
  positionCode: string | null;
  positionName: string | null;
  dailyRate: string;
  days: DayCell[];
  total: string;
}
export interface WorksheetData {
  worksheetId: number;
  siteCode: string;
  siteName: string;
  workYear: number;
  workMonth: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  rejectReason: string | null;
  attendanceCodes: AttendanceCode[];
  details: DetailRow[];
  canSave: boolean;
  canApprove: boolean;
}

const CODE_COLORS: Record<string, string> = {
  D: "bg-amber-100 text-amber-800 border-amber-300",
  N: "bg-indigo-100 text-indigo-800 border-indigo-300",
  "D-N": "bg-purple-100 text-purple-800 border-purple-300",
  F: "bg-gray-100 text-gray-500 border-gray-300",
};

function fmtBaht(v: string | number) {
  return Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Data is fetched server-side for the initial render (page.tsx) and after
// that only ever re-fetched from event handlers (select onChange, button
// onClick) — never from a useEffect. This Next.js version's eslint-config
// (react-hooks 7's React Compiler ruleset) flags any effect that ends in a
// setState, including indirectly via an awaited fetch; fetching on mount/
// param-change is meant to happen in a Server Component instead.
export default function WorksheetView({
  sites,
  employees,
  positions,
  initialData,
  initialError,
}: {
  sites: Site[];
  employees: { EmpCode: string; FullName: string }[];
  positions: { PositionCode: string; PositionName: string }[];
  initialData: WorksheetData | null;
  initialError: string | null;
}) {
  const [siteCode, setSiteCode] = useState(initialData?.siteCode ?? sites[0]?.SiteCode ?? "");
  const [year, setYear] = useState(initialData?.workYear ?? new Date().getFullYear());
  const [month, setMonth] = useState(initialData?.workMonth ?? new Date().getMonth() + 1);
  const [data, setData] = useState<WorksheetData | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [newEmpCode, setNewEmpCode] = useState("");
  const [newPositionCode, setNewPositionCode] = useState("");
  const [editingPositionEmpCode, setEditingPositionEmpCode] = useState<string | null>(null);
  const [editPositionValue, setEditPositionValue] = useState("");
  const [rejectReasonInput, setRejectReasonInput] = useState("");
  const [fillFrom, setFillFrom] = useState(1);
  const [fillTo, setFillTo] = useState(1);
  const [fillCode, setFillCode] = useState("");
  const [fillTarget, setFillTarget] = useState("ALL");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load(s: string, y: number, m: number) {
    if (!s) return;
    setLoading(true);
    const res = await fetch(`/api/worksheets?site=${s}&year=${y}&month=${m}`);
    const body = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(body.message || body.error);
      setData(null);
      return;
    }
    setError(null);
    setData(body);
  }

  function onFilterChange(next: { site?: string; year?: number; month?: number }) {
    const s = next.site ?? siteCode;
    const y = next.year ?? year;
    const m = next.month ?? month;
    setSiteCode(s);
    setYear(y);
    setMonth(m);
    load(s, y, m);
  }

  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);

  // 2026-09-21: clicking a cell now paints it directly with whatever code is
  // currently selected in the "ใส่ช่วงวันที่" dropdown (fillCode — including
  // its "- ว่าง -" option to clear a cell), instead of the old behavior of
  // cycling D -> N -> D-N -> F -> blank on every click. That dropdown was
  // already there for the bulk date-range fill; it now doubles as the
  // "paint brush" for single-cell clicks too, so there's one place to pick
  // the code from instead of clicking through the cycle to find it.
  function paintCell(detailIdx: number, dayIdx: number) {
    if (!data || !data.canSave || data.status !== "DRAFT") return;
    const next = fillCode || null;
    setData((prev) => {
      if (!prev) return prev;
      const details = [...prev.details];
      const detail = { ...details[detailIdx] };
      const days = [...detail.days];
      days[dayIdx] = { ...days[dayIdx], attendCode: next };
      detail.days = days;
      details[detailIdx] = detail;
      return { ...prev, details };
    });
  }

  async function saveDays() {
    if (!data) return;
    setMessage(null);
    const entries = data.details.flatMap((d) =>
      d.days.map((day) => ({ worksheetDetailId: d.worksheetDetailId, day: day.day, attendCode: day.attendCode })),
    );
    const res = await fetch(`/api/worksheets/${data.worksheetId}/days`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entries),
    });
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? "บันทึกแล้ว" : body.message || body.error);
    if (res.ok) load(siteCode, year, month);
  }

  async function addEmployee() {
    if (!data || !newEmpCode.trim() || !newPositionCode) return;
    setMessage(null);
    const res = await fetch(`/api/worksheets/${data.worksheetId}/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empCode: newEmpCode.trim(), positionCode: newPositionCode }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    setNewEmpCode("");
    setNewPositionCode("");
    load(siteCode, year, month);
  }

  async function removeEmployee(empCode: string) {
    if (!data) return;
    if (!(await confirmDialog(`ยืนยันลบพนักงาน ${empCode} ออกจากใบลงเวลานี้?`))) return;
    const res = await fetch(`/api/worksheets/${data.worksheetId}/employees/${empCode}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? null : body.message || body.error);
    if (res.ok) load(siteCode, year, month);
  }

  // 2026-09-21 — เปลี่ยนตำแหน่งของ SPARE row (แก้ไม่ได้สำหรับ REGULAR ตาม
  // การออกแบบ — server บล็อกไว้อยู่แล้ว แต่ UI ไม่แสดงปุ่มนี้ให้ REGULAR เลย)
  function startEditPosition(d: DetailRow) {
    setEditingPositionEmpCode(d.empCode);
    setEditPositionValue(d.positionCode ?? "");
  }

  async function saveEditPosition(empCode: string) {
    if (!data || !editPositionValue) return;
    setMessage(null);
    const res = await fetch(`/api/worksheets/${data.worksheetId}/employees/${empCode}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionCode: editPositionValue }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    setEditingPositionEmpCode(null);
    load(siteCode, year, month);
  }

  async function removeAllEmployees() {
    if (!data) return;
    if (!(await confirmDialog(`ยืนยันลบพนักงานทั้งหมด (${data.details.length} คน) ออกจากใบลงเวลานี้?`))) return;
    const res = await fetch(`/api/worksheets/${data.worksheetId}/employees`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? null : body.message || body.error);
    if (res.ok) load(siteCode, year, month);
  }

  // 2026-09-21 — re-runs the REGULAR auto-pull for a worksheet that already
  // exists (only ran once, at creation, otherwise). Additive only, so no
  // confirm dialog needed (nothing existing is touched/removed).
  async function repullEmployees() {
    if (!data) return;
    setMessage(null);
    const res = await fetch(`/api/worksheets/${data.worksheetId}/repull`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    setMessage(body.added > 0 ? `ดึงพนักงานเพิ่ม ${body.added} คน` : "ไม่มีพนักงานใหม่ให้ดึงเพิ่ม");
    load(siteCode, year, month);
  }

  // 2026-09-22 — export the current grid to .xlsx (mirrors the on-screen
  // columns: code/name/type/position/rate, one column per day, total) and
  // re-import it back — only fills in attendance codes for employees
  // already on this sheet (see the import route for why membership itself
  // isn't editable via the file).
  async function exportExcel() {
    if (!data) return;
    setMessage(null);
    const res = await fetch(`/api/worksheets/${data.worksheetId}/export`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMessage(body.message || body.error);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `worksheet_${data.siteCode}_${data.workYear}${String(data.workMonth).padStart(2, "0")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-selecting the same file still fires onChange
    if (!data || !file) return;

    if (!(await confirmDialog("ยืนยันนำเข้าข้อมูลจาก Excel? กะที่มีอยู่แล้วในวันที่ตรงกันจะถูกเขียนทับ", "#111827"))) return;

    setMessage(null);
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/worksheets/${data.worksheetId}/import`, { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || `${body.error}${body.unknownEmpCodes ? ` (${body.unknownEmpCodes.join(", ")})` : ""}`);
        return;
      }
      setMessage(`นำเข้าแล้ว ${body.employees} คน, ${body.count} ช่อง`);
      load(siteCode, year, month);
    } finally {
      setImporting(false);
    }
  }

  function fillRange() {
    if (!data) return;
    const from = Math.min(fillFrom, fillTo);
    const to = Math.max(fillFrom, fillTo);
    const code = fillCode || null;
    setData((prev) => {
      if (!prev) return prev;
      const details = prev.details.map((d) => {
        if (fillTarget !== "ALL" && d.empCode !== fillTarget) return d;
        const days = d.days.map((day) => (day.day >= from && day.day <= to ? { ...day, attendCode: code } : day));
        return { ...d, days };
      });
      return { ...prev, details };
    });
  }

  async function submit() {
    if (!data) return;
    const res = await fetch(`/api/worksheets/${data.worksheetId}/submit`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? "ส่งอนุมัติแล้ว" : body.message || body.error);
    if (res.ok) load(siteCode, year, month);
  }

  async function approve() {
    if (!data) return;
    if (!(await confirmDialog(`ยืนยันอนุมัติใบลงเวลานี้ (${data.details.length} คน)?`, "#16a34a"))) return;
    const res = await fetch(`/api/worksheets/${data.worksheetId}/approve`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? "อนุมัติแล้ว" : body.message || `${body.error}${body.empCode ? ` (${body.empCode})` : ""}`);
    if (res.ok) load(siteCode, year, month);
  }

  async function reject() {
    if (!data || !rejectReasonInput.trim()) return;
    const res = await fetch(`/api/worksheets/${data.worksheetId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectReasonInput.trim() }),
    });
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? "ไม่อนุมัติแล้ว" : body.message || body.error);
    if (res.ok) {
      setRejectReasonInput("");
      load(siteCode, year, month);
    }
  }

  async function unapprove() {
    if (!data) return;
    if (!(await confirmDialog("ยืนยันยกเลิกการอนุมัติ? ใบลงเวลาจะกลับไปเป็นร่างและยอดที่โพสต์เข้าเงินเดือนจะถูกล้างกลับเป็น 0"))) return;
    const res = await fetch(`/api/worksheets/${data.worksheetId}/unapprove`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? "ยกเลิกการอนุมัติแล้ว" : body.message || `${body.error}${body.empCode ? ` (${body.empCode})` : ""}`);
    if (res.ok) load(siteCode, year, month);
  }

  const grandTotal = data?.details.reduce((sum, d) => sum + Number(d.total), 0) ?? 0;
  const regularCount = data?.details.filter((d) => d.empType === "REGULAR").length ?? 0;
  const spareCount = data?.details.filter((d) => d.empType === "SPARE").length ?? 0;

  // 2026-09-21 — "รหัสพนักงานสแปร์" ค้นหาได้จากทะเบียนพนักงานทั้งระบบ
  // (สถานะปกติ/ทดลองงาน, ไม่กรองตามหน่วยงาน — สแปร์อาจเป็นคนหน่วยงานอื่นหรือ
  // ยังไม่กำหนดหน่วยงานก็ได้) ตัดแค่คนที่มีอยู่ในใบนี้แล้วออกจากตัวเลือก
  const existingEmpCodes = new Set(data?.details.map((d) => d.empCode) ?? []);
  const spareCandidateEmployees = employees.filter((e) => !existingEmpCodes.has(e.EmpCode));

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded border border-gray-200 p-3">
        <select
          value={siteCode}
          onChange={(e) => onFilterChange({ site: e.target.value })}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {sites.map((s) => (
            <option key={s.SiteCode} value={s.SiteCode}>
              {s.SiteName}
            </option>
          ))}
        </select>
        <select
          value={month}
          onChange={(e) => onFilterChange({ month: Number(e.target.value) })}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              เดือน {m}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={toBuddhistYear(year)}
          onChange={(e) => onFilterChange({ year: toGregorianYear(Number(e.target.value)) })}
          className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        {data && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              data.status === "APPROVED"
                ? "bg-green-100 text-green-700"
                : data.status === "SUBMITTED"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-gray-100 text-gray-600"
            }`}
          >
            {data.status}
          </span>
        )}
        {data && (
          <button onClick={exportExcel} className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50">
            ส่งออก Excel
          </button>
        )}
        {data && data.canSave && data.status === "DRAFT" && (
          <>
            <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFileChange} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {importing ? "กำลังนำเข้า..." : "นำเข้า Excel"}
            </button>
          </>
        )}
      </div>

      {loading && <p className="text-sm text-gray-500">กำลังโหลด...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data?.rejectReason && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">ถูกไม่อนุมัติ: {data.rejectReason}</p>
      )}

      {data && (
        <>
          {/* Legend */}
          <div className="flex flex-wrap gap-2 text-xs">
            {data.attendanceCodes.map((c) => (
              <span key={c.Code} className={`rounded border px-2 py-1 ${CODE_COLORS[c.Code] ?? "bg-gray-100"}`}>
                {c.Code} — {c.CodeNameTH} (×{c.PayMultiplier})
              </span>
            ))}
          </div>

          {/* Bulk fill a date range with one code, for one or all employees — local edit only, click บันทึก to save */}
          {data.canSave && data.status === "DRAFT" && (
            <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-gray-300 p-2 text-sm">
              <span className="text-gray-500">ใส่กะตามช่วงวันที่:</span>
              <select value={fillFrom} onChange={(e) => setFillFrom(Number(e.target.value))} className="rounded border border-gray-300 px-1.5 py-1 text-sm">
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <span className="text-gray-400">ถึง</span>
              <select value={fillTo} onChange={(e) => setFillTo(Number(e.target.value))} className="rounded border border-gray-300 px-1.5 py-1 text-sm">
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select value={fillCode} onChange={(e) => setFillCode(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1 text-sm">
                <option value="">- ว่าง -</option>
                {data.attendanceCodes.map((c) => (
                  <option key={c.Code} value={c.Code}>
                    {c.Code}
                  </option>
                ))}
              </select>
              <select value={fillTarget} onChange={(e) => setFillTarget(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1 text-sm">
                <option value="ALL">ทุกคน</option>
                {data.details.map((d) => (
                  <option key={d.empCode} value={d.empCode}>
                    {d.empName}
                  </option>
                ))}
              </select>
              <button onClick={fillRange} className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50">
                ใส่กะตามช่วงวันที่
              </button>
            </div>
          )}

          {/* Grid */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="sticky left-0 bg-white px-2 py-1">พนักงาน</th>
                  <th className="px-2 py-1">ประเภท</th>
                  <th className="px-2 py-1">ตำแหน่ง</th>
                  {Array.from({ length: daysInMonth }, (_, i) => (
                    <th key={i} className="px-1 py-1 text-center">
                      {i + 1}
                    </th>
                  ))}
                  <th className="px-2 py-1 text-right">รวม</th>
                  {data.canSave && data.status === "DRAFT" && <th className="px-2 py-1"></th>}
                </tr>
              </thead>
              <tbody>
                {data.details.map((d, detailIdx) => (
                  <tr key={d.worksheetDetailId} className="border-b border-gray-100">
                    <td className="sticky left-0 whitespace-nowrap bg-white px-2 py-1">{d.empName}</td>
                    <td className="px-2 py-1">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          d.empType === "REGULAR" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                        }`}
                      >
                        {d.empType === "REGULAR" ? "ประจำ" : "สแปร์"}
                      </span>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      {editingPositionEmpCode === d.empCode ? (
                        <div className="flex items-center gap-1">
                          <select
                            value={editPositionValue}
                            onChange={(e) => setEditPositionValue(e.target.value)}
                            className="rounded border border-gray-300 px-1 py-0.5 text-xs"
                          >
                            <option value="">- เลือกตำแหน่ง -</option>
                            {positions.map((p) => (
                              <option key={p.PositionCode} value={p.PositionCode}>
                                {p.PositionName}
                              </option>
                            ))}
                          </select>
                          <button onClick={() => saveEditPosition(d.empCode)} className="text-[10px] text-gray-900 hover:underline">
                            บันทึก
                          </button>
                          <button onClick={() => setEditingPositionEmpCode(null)} className="text-[10px] text-gray-400 hover:underline">
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <span className="flex items-center gap-1">
                          {d.positionName ?? "-"}
                          {d.empType === "SPARE" && data.canSave && data.status === "DRAFT" && (
                            <button onClick={() => startEditPosition(d)} className="text-[10px] text-gray-400 hover:underline">
                              แก้ไข
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                    {d.days.map((day, dayIdx) => (
                      <td key={day.day} className="px-0.5 py-0.5 text-center">
                        <button
                          type="button"
                          onClick={() => paintCell(detailIdx, dayIdx)}
                          disabled={!data.canSave || data.status !== "DRAFT"}
                          className={`h-6 w-6 rounded border text-[10px] ${
                            day.attendCode ? (CODE_COLORS[day.attendCode] ?? "bg-gray-100") : "border-dashed border-gray-200"
                          }`}
                        >
                          {day.attendCode ?? ""}
                        </button>
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right font-medium">{fmtBaht(d.total)}</td>
                    {data.canSave && data.status === "DRAFT" && (
                      <td className="px-2 py-1">
                        <button onClick={() => removeEmployee(d.empCode)} className="text-red-500 hover:underline">
                          ลบ
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add spare employee / re-pull REGULAR employees */}
          {data.canSave && data.status === "DRAFT" && (
            <div className="flex items-center gap-2">
              <div className="w-72">
                <SearchableSelect
                  value={newEmpCode}
                  onChange={setNewEmpCode}
                  options={spareCandidateEmployees.map((e) => ({ code: e.EmpCode, label: `${e.EmpCode} — ${e.FullName}` }))}
                  placeholder="ค้นหารหัส/ชื่อพนักงานสแปร์"
                />
              </div>
              <select value={newPositionCode} onChange={(e) => setNewPositionCode(e.target.value)} className="rounded border border-dashed border-gray-300 px-2 py-1 text-sm">
                <option value="">- ตำแหน่งที่มาทำ -</option>
                {positions.map((p) => (
                  <option key={p.PositionCode} value={p.PositionCode}>
                    {p.PositionName}
                  </option>
                ))}
              </select>
              <button
                onClick={addEmployee}
                disabled={!newEmpCode || !newPositionCode}
                className="rounded border border-dashed border-gray-300 px-3 py-1 text-sm text-gray-600 disabled:opacity-50"
              >
                + เพิ่มพนักงานสแปร์
              </button>
              {data.details.length > 0 && (
                <button onClick={removeAllEmployees} className="rounded border border-dashed border-red-300 px-3 py-1 text-sm text-red-600">
                  ลบพนักงานทั้งหมด
                </button>
              )}
              <button onClick={repullEmployees} className="rounded border border-dashed border-gray-300 px-3 py-1 text-sm text-gray-600">
                ↻ ดึงรายชื่อพนักงานอีกครั้ง
              </button>
            </div>
          )}

          {/* Summary */}
          <div className="flex items-center justify-between rounded bg-gray-50 p-3 text-sm">
            <span>
              พนักงานทั้งหมด {data.details.length} คน · ประจำ {regularCount} · สแปร์ {spareCount}
            </span>
            <span className="font-semibold">ยอดค่าแรงรวม {fmtBaht(grandTotal)} บาท</span>
          </div>

          {message && <p className="text-sm text-gray-600">{message}</p>}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {data.status === "DRAFT" && data.canSave && (
              <>
                <button onClick={saveDays} className="rounded border border-gray-300 px-4 py-2 text-sm">
                  บันทึก
                </button>
                <button onClick={submit} className="rounded bg-blue-600 px-4 py-2 text-sm text-white">
                  ส่งอนุมัติ
                </button>
              </>
            )}
            {data.status === "SUBMITTED" && data.canApprove && (
              <>
                <button onClick={approve} className="rounded bg-green-600 px-4 py-2 text-sm text-white">
                  อนุมัติ
                </button>
                <div className="flex items-center gap-2">
                  <input
                    value={rejectReasonInput}
                    onChange={(e) => setRejectReasonInput(e.target.value)}
                    placeholder="เหตุผลที่ไม่อนุมัติ"
                    className="rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                  <button onClick={reject} className="rounded border border-red-300 px-4 py-2 text-sm text-red-600">
                    ไม่อนุมัติ
                  </button>
                </div>
              </>
            )}
            {data.status === "APPROVED" && (
              <>
                <p className="text-sm text-gray-500">ข้อมูลถูกล็อก ไม่สามารถแก้ไขได้หลังอนุมัติ</p>
                {data.canApprove && (
                  <button onClick={unapprove} className="rounded border border-red-300 px-4 py-2 text-sm text-red-600">
                    ยกเลิกการอนุมัติ
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
