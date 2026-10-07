"use client";

import { useState } from "react";
import Swal from "sweetalert2";
import { LEAVE_STATUS_LABELS, leaveIsAwaitingResubmit, type LeaveStatus } from "@/lib/leave";
import { toBuddhistYear } from "@/lib/buddhist-year";
import type { MobileLeaveData } from "@/lib/mobile-leave";

const inputCls = "w-full rounded border border-gray-300 px-3 py-2 text-base disabled:bg-gray-100";
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "UTC" });

export default function MobileLeaveView({ initial }: { initial: MobileLeaveData }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [leaveTypeCode, setLeaveTypeCode] = useState("");
  const [isFullDay, setIsFullDay] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hours, setHours] = useState("");
  const [hasMedicalCert, setHasMedicalCert] = useState(false);

  const thisYear = new Date().getFullYear();
  const years = [thisYear, thisYear - 1, thisYear - 2];
  const selectedType = data.leaveTypes.find((t) => t.leaveTypeCode === leaveTypeCode);

  async function loadYear(year: number) {
    setMessage(null);
    const res = await fetch(`/api/mobile/leave?year=${year}`);
    const body = await res.json();
    if (!res.ok) {
      setMessage({ ok: false, text: body.message || body.error || "โหลดข้อมูลไม่สำเร็จ" });
      return;
    }
    setData(body);
  }

  async function createRequest() {
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/mobile/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveTypeCode,
          startDate,
          endDate: isFullDay ? endDate || startDate : undefined,
          isFullDay,
          hoursRequested: isFullDay ? undefined : Number(hours),
          hasMedicalCert,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ ok: false, text: body.message || body.error || "สร้างใบลาไม่สำเร็จ" });
        return;
      }
      setMessage({ ok: true, text: `สร้างใบลาแล้ว (เลขที่ ${body.documentNo}) — กด "ส่งขออนุมัติ" ในรายการด้านล่างเพื่อส่งให้ผู้อนุมัติ` });
      setLeaveTypeCode("");
      setStartDate("");
      setEndDate("");
      setHours("");
      setHasMedicalCert(false);
      await loadYear(data.year);
    } finally {
      setBusy(false);
    }
  }

  async function act(leaveId: number, action: "SUBMIT" | "CANCEL", docNo: string | null) {
    const confirm = await Swal.fire({
      icon: action === "SUBMIT" ? "question" : "warning",
      title: action === "SUBMIT" ? "ส่งขออนุมัติใบลานี้?" : "ยกเลิกใบลานี้?",
      text: docNo ? `เลขที่เอกสาร ${docNo}` : undefined,
      showCancelButton: true,
      confirmButtonText: action === "SUBMIT" ? "ส่งขออนุมัติ" : "ยกเลิกใบลา",
      cancelButtonText: "ปิด",
      confirmButtonColor: action === "SUBMIT" ? "#16a34a" : "#dc2626",
    });
    if (!confirm.isConfirmed) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/mobile/leave/${leaveId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ ok: false, text: body.message || body.error || "ทำรายการไม่สำเร็จ" });
        return;
      }
      setMessage({ ok: true, text: action === "SUBMIT" ? "ส่งขออนุมัติแล้ว" : "ยกเลิกใบลาแล้ว" });
      await loadYear(data.year);
    } finally {
      setBusy(false);
    }
  }

  const canCreate = !!leaveTypeCode && !!startDate && (isFullDay ? true : Number(hours) > 0);

  return (
    <div className="mt-5 space-y-5">
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="font-medium text-gray-900">ขอลางาน</h2>
        <div className="mt-3 space-y-3">
          <label className="block text-sm text-gray-700">
            ประเภทการลา
            <select className={`${inputCls} mt-1`} value={leaveTypeCode} onChange={(e) => setLeaveTypeCode(e.target.value)}>
              <option value="">- เลือกประเภทการลา -</option>
              {data.leaveTypes.map((t) => (
                <option key={t.leaveTypeCode} value={t.leaveTypeCode}>
                  {t.leaveTypeName}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isFullDay} onChange={(e) => setIsFullDay(e.target.checked)} />
            ลาทั้งวัน (ไม่ติ๊ก = ลาเป็นชั่วโมง วันเดียว)
          </label>
          <div className={isFullDay ? "grid grid-cols-2 gap-3" : ""}>
            <label className="block text-sm text-gray-700">
              {isFullDay ? "ตั้งแต่วันที่" : "วันที่ลา"}
              <input type="date" className={`${inputCls} mt-1`} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            {isFullDay && (
              <label className="block text-sm text-gray-700">
                ถึงวันที่
                <input type="date" className={`${inputCls} mt-1`} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
            )}
          </div>
          {!isFullDay && (
            <label className="block text-sm text-gray-700">
              จำนวนชั่วโมง (8 ชม. = 1 วัน)
              <input type="number" step="0.5" min="0.5" max="24" inputMode="decimal" className={`${inputCls} mt-1`} value={hours} onChange={(e) => setHours(e.target.value)} />
            </label>
          )}
          {selectedType?.requireMedicalCert && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={hasMedicalCert} onChange={(e) => setHasMedicalCert(e.target.checked)} />
              มีใบรับรองแพทย์ (ประเภทนี้ต้องมีก่อนส่งขออนุมัติ)
            </label>
          )}
          <button type="button" onClick={createRequest} disabled={busy || !canCreate} className="w-full rounded bg-blue-600 px-4 py-3 text-base font-medium text-white disabled:opacity-50">
            สร้างใบลา
          </button>
        </div>
      </section>

      {message && <p className={`rounded p-3 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>}

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium text-gray-900">ประวัติการลาประจำปี</h2>
          <select className="rounded border border-gray-300 px-2 py-1 text-sm" value={data.year} onChange={(e) => loadYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                พ.ศ. {toBuddhistYear(y)}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2">
          {data.balances
            .filter((b) => b.eligible)
            .map((b) => (
              <div key={b.leaveTypeCode} className="flex items-center justify-between rounded bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-700">{b.leaveTypeName}</span>
                <span className="text-gray-900">
                  ใช้ {b.used} / สิทธิ {b.entitled} <span className="text-gray-500">(เหลือ {b.remaining} วัน)</span>
                </span>
              </div>
            ))}
        </div>

        <ul className="mt-4 divide-y divide-gray-100">
          {data.requests.length === 0 && <li className="py-3 text-sm text-gray-500">ไม่มีรายการลาในปีนี้</li>}
          {data.requests.map((r) => {
            const rejected = leaveIsAwaitingResubmit(r.status, r.rejectReason);
            const statusLabel = rejected ? "ไม่อนุมัติ" : (LEAVE_STATUS_LABELS[r.status as LeaveStatus] ?? r.status);
            return (
              <li key={r.leaveId} className="py-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-gray-900">{r.leaveTypeName}</div>
                    <div className="text-gray-600">
                      {fmtDate(r.startDate)}
                      {r.isFullDay && r.startDate !== r.endDate ? ` - ${fmtDate(r.endDate)}` : ""}
                      {!r.isFullDay && r.hoursRequested ? ` (${r.hoursRequested} ชม.)` : ""} · {r.totalDays} วัน
                    </div>
                    {r.documentNo && <div className="text-xs text-gray-400">เลขที่ {r.documentNo}</div>}
                  </div>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${rejected ? "bg-red-50 text-red-600" : r.status === "APPROVED" ? "bg-green-50 text-green-700" : r.status === "SUBMITTED" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                    {statusLabel}
                  </span>
                </div>
                {rejected && <div className="mt-1 text-xs text-red-600">เหตุผลที่ไม่อนุมัติ: {r.rejectReason}</div>}
                <div className="mt-2 flex gap-2">
                  {r.status === "DRAFT" && (
                    <button type="button" disabled={busy} onClick={() => act(r.leaveId, "SUBMIT", r.documentNo)} className="rounded bg-green-600 px-3 py-1.5 text-white disabled:opacity-50">
                      ส่งขออนุมัติ
                    </button>
                  )}
                  {(r.status === "DRAFT" || r.status === "SUBMITTED") && (
                    <button type="button" disabled={busy} onClick={() => act(r.leaveId, "CANCEL", r.documentNo)} className="rounded border border-red-300 px-3 py-1.5 text-red-600 disabled:opacity-50">
                      ยกเลิกการขอ
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
