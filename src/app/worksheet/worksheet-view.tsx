"use client";

import { useMemo, useState } from "react";

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
  initialData,
  initialError,
}: {
  sites: Site[];
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
  const [rejectReasonInput, setRejectReasonInput] = useState("");

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
  const codeCycle = useMemo(() => [null, ...(data?.attendanceCodes.map((c) => c.Code) ?? [])], [data]);

  function cycleCell(detailIdx: number, dayIdx: number) {
    if (!data || !data.canSave || data.status !== "DRAFT") return;
    setData((prev) => {
      if (!prev) return prev;
      const details = [...prev.details];
      const detail = { ...details[detailIdx] };
      const days = [...detail.days];
      const current = days[dayIdx].attendCode;
      const currentPos = codeCycle.indexOf(current);
      const next = codeCycle[(currentPos + 1) % codeCycle.length];
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
    if (!data || !newEmpCode.trim()) return;
    setMessage(null);
    const res = await fetch(`/api/worksheets/${data.worksheetId}/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empCode: newEmpCode.trim() }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    setNewEmpCode("");
    load(siteCode, year, month);
  }

  async function removeEmployee(empCode: string) {
    if (!data) return;
    const res = await fetch(`/api/worksheets/${data.worksheetId}/employees/${empCode}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? null : body.message || body.error);
    if (res.ok) load(siteCode, year, month);
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
    setMessage(res.ok ? "ตีกลับแล้ว" : body.message || body.error);
    if (res.ok) {
      setRejectReasonInput("");
      load(siteCode, year, month);
    }
  }

  const grandTotal = data?.details.reduce((sum, d) => sum + Number(d.total), 0) ?? 0;
  const regularCount = data?.details.filter((d) => d.empType === "REGULAR").length ?? 0;
  const spareCount = data?.details.filter((d) => d.empType === "SPARE").length ?? 0;

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
          value={year}
          onChange={(e) => onFilterChange({ year: Number(e.target.value) })}
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
      </div>

      {loading && <p className="text-sm text-gray-500">กำลังโหลด...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data?.rejectReason && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">ถูกตีกลับ: {data.rejectReason}</p>
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

          {/* Grid */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="sticky left-0 bg-white px-2 py-1">พนักงาน</th>
                  <th className="px-2 py-1">ประเภท</th>
                  <th className="px-2 py-1 text-right">ค่าแรง/วัน</th>
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
                    <td className="px-2 py-1 text-right">{fmtBaht(d.dailyRate)}</td>
                    {d.days.map((day, dayIdx) => (
                      <td key={day.day} className="px-0.5 py-0.5 text-center">
                        <button
                          type="button"
                          onClick={() => cycleCell(detailIdx, dayIdx)}
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

          {/* Add spare employee */}
          {data.canSave && data.status === "DRAFT" && (
            <div className="flex items-center gap-2">
              <input
                value={newEmpCode}
                onChange={(e) => setNewEmpCode(e.target.value)}
                placeholder="รหัสพนักงานสแปร์"
                className="rounded border border-dashed border-gray-300 px-2 py-1 text-sm"
              />
              <button onClick={addEmployee} className="rounded border border-dashed border-gray-300 px-3 py-1 text-sm text-gray-600">
                + เพิ่มพนักงานสแปร์
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
                    placeholder="เหตุผลที่ตีกลับ"
                    className="rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                  <button onClick={reject} className="rounded border border-red-300 px-4 py-2 text-sm text-red-600">
                    ตีกลับ
                  </button>
                </div>
              </>
            )}
            {data.status === "APPROVED" && (
              <p className="text-sm text-gray-500">ข้อมูลถูกล็อก ไม่สามารถแก้ไขได้หลังอนุมัติ</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
