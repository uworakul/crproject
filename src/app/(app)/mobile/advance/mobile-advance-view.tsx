"use client";

import { useState } from "react";
import Swal from "sweetalert2";
import type { MobileAdvance } from "@/lib/mobile-requests";

const inputCls = "w-full rounded border border-gray-300 px-3 py-2 text-base";
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "UTC" });
const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 });

export default function MobileAdvanceView({ initial }: { initial: MobileAdvance[] }) {
  const [requests, setRequests] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // The inline message sits below the form, off-screen on a phone — a result
  // also pops up so a failed request is never silent.
  function notify(m: { ok: boolean; text: string }) {
    setMessage(m);
    Swal.fire({ icon: m.ok ? "success" : "error", title: m.ok ? "สำเร็จ" : "ทำรายการไม่สำเร็จ", text: m.text, confirmButtonText: "ปิด" });
  }
  const [amount, setAmount] = useState("");
  const [remark, setRemark] = useState("");

  async function reload() {
    const res = await fetch("/api/mobile/advance");
    const body = await res.json();
    if (res.ok) setRequests(body.requests);
  }

  async function createRequest() {
    const confirm = await Swal.fire({
      icon: "question",
      title: "ขอเบิกล่วงหน้า?",
      text: `ยอด ${baht(Number(amount))} บาท (หักทั้งหมดในงวดเดียว)`,
      showCancelButton: true,
      confirmButtonText: "ขอเบิก",
      cancelButtonText: "ปิด",
      confirmButtonColor: "#16a34a",
    });
    if (!confirm.isConfirmed) return;
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/mobile/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), remark }),
      });
      const body = await res.json();
      if (!res.ok) {
        notify({ ok: false, text: body.message || body.error || "ส่งคำขอไม่สำเร็จ" });
        return;
      }
      notify({ ok: true, text: `ขอเบิกแล้ว (เลขที่ ${body.documentNo}) — รอผู้อนุมัติพิจารณา` });
      setAmount("");
      setRemark("");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function act(id: number, action: "SUBMIT" | "CANCEL", docNo: string | null) {
    const confirm = await Swal.fire({
      icon: action === "SUBMIT" ? "question" : "warning",
      title: action === "SUBMIT" ? "ขอเบิกอีกครั้ง?" : "ยกเลิกคำขอนี้?",
      text: docNo ? `เลขที่เอกสาร ${docNo}` : undefined,
      showCancelButton: true,
      confirmButtonText: action === "SUBMIT" ? "ขอเบิก" : "ยกเลิกคำขอ",
      cancelButtonText: "ปิด",
      confirmButtonColor: action === "SUBMIT" ? "#16a34a" : "#dc2626",
    });
    if (!confirm.isConfirmed) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/mobile/advance/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const body = await res.json();
      if (!res.ok) {
        notify({ ok: false, text: body.message || body.error || "ทำรายการไม่สำเร็จ" });
        return;
      }
      notify({ ok: true, text: action === "SUBMIT" ? "ขอเบิกแล้ว" : "ยกเลิกคำขอแล้ว" });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const amountNum = Number(amount);
  const canCreate = amountNum > 0;

  return (
    <div className="mt-5 space-y-5">
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="font-medium text-gray-900">ขอเงินเบิกล่วงหน้า</h2>
        <div className="mt-3 space-y-3">
          <label className="block text-sm text-gray-700">
            ยอดที่ขอเบิก (บาท)
            <input type="number" inputMode="decimal" min="0" step="0.01" className={`${inputCls} mt-1`} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="block text-sm text-gray-700">
            หมายเหตุ (ถ้ามี)
            <input className={`${inputCls} mt-1`} value={remark} maxLength={300} onChange={(e) => setRemark(e.target.value)} />
          </label>
          <button type="button" onClick={createRequest} disabled={busy || !canCreate} className="w-full rounded bg-blue-600 px-4 py-3 text-base font-medium text-white disabled:opacity-50">
            ขอเบิก
          </button>
        </div>
      </section>

      {message && <p className={`rounded p-3 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>}

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="font-medium text-gray-900">รายการที่เคยขอ</h2>
        <ul className="mt-3 divide-y divide-gray-100">
          {requests.length === 0 && <li className="py-3 text-sm text-gray-500">ยังไม่มีรายการ</li>}
          {requests.map((r) => {
            const rejected = r.status === "DRAFT" && !!r.rejectReason;
            const label = rejected ? "ไม่อนุมัติ" : r.status === "APPROVED" ? "อนุมัติแล้ว" : r.status === "SUBMITTED" ? "รออนุมัติ" : "แบบร่าง";
            return (
              <li key={r.requestHeaderId} className="py-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-gray-900">{baht(r.amount)} บาท</div>
                    <div className="text-gray-600">{fmtDate(r.requestDate)}</div>
                    {r.documentNo && <div className="text-xs text-gray-400">เลขที่ {r.documentNo}</div>}
                    {r.remark && <div className="text-xs text-gray-500">{r.remark}</div>}
                  </div>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${rejected ? "bg-red-50 text-red-600" : r.status === "APPROVED" ? "bg-green-50 text-green-700" : r.status === "SUBMITTED" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                    {label}
                  </span>
                </div>
                {rejected && <div className="mt-1 text-xs text-red-600">เหตุผลที่ไม่อนุมัติ: {r.rejectReason}</div>}
                <div className="mt-2 flex gap-2">
                  {r.status === "DRAFT" && (
                    <button type="button" disabled={busy} onClick={() => act(r.requestHeaderId, "SUBMIT", r.documentNo)} className="rounded bg-green-600 px-3 py-1.5 text-white disabled:opacity-50">
                      ขอเบิกอีกครั้ง
                    </button>
                  )}
                  {(r.status === "DRAFT" || r.status === "SUBMITTED") && (
                    <button type="button" disabled={busy} onClick={() => act(r.requestHeaderId, "CANCEL", r.documentNo)} className="rounded border border-red-300 px-3 py-1.5 text-red-600 disabled:opacity-50">
                      ยกเลิกคำขอ
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
