"use client";

import { useState } from "react";
import Swal from "sweetalert2";
import type { MobileUniformData } from "@/lib/mobile-requests";

const inputCls = "w-full rounded border border-gray-300 px-3 py-2 text-base";
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "UTC" });
const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 });

interface CartLine {
  productCode: string;
  qty: string;
}

export default function MobileUniformView({ initial }: { initial: MobileUniformData }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // The inline message sits below the form, off-screen on a phone — a result
  // also pops up so a failed request is never silent.
  function notify(m: { ok: boolean; text: string }) {
    setMessage(m);
    Swal.fire({ icon: m.ok ? "success" : "error", title: m.ok ? "สำเร็จ" : "ทำรายการไม่สำเร็จ", text: m.text, confirmButtonText: "ปิด" });
  }
  const [cart, setCart] = useState<CartLine[]>([]);
  const [productCode, setProductCode] = useState("");
  const [qty, setQty] = useState("1");
  const [remark, setRemark] = useState("");

  const priceOf = (code: string) => data.products.find((p) => p.productCode === code)?.unitPrice ?? 0;
  const nameOf = (code: string) => data.products.find((p) => p.productCode === code)?.productName ?? code;
  const cartTotal = cart.reduce((s, l) => s + priceOf(l.productCode) * Number(l.qty), 0);

  async function reload() {
    const res = await fetch("/api/mobile/uniform");
    const body = await res.json();
    if (res.ok) setData(body);
  }

  function addToCart() {
    const n = Number(qty);
    if (!productCode || !(n > 0)) return;
    setCart((c) => {
      const existing = c.find((l) => l.productCode === productCode);
      return existing ? c.map((l) => (l === existing ? { ...l, qty: String(Number(l.qty) + n) } : l)) : [...c, { productCode, qty: String(n) }];
    });
    setProductCode("");
    setQty("1");
  }

  async function submit() {
    const confirm = await Swal.fire({
      icon: "question",
      title: "ขอเบิกชุด?",
      text: `${cart.length} รายการ · รวม ${baht(cartTotal)} บาท (ค่าชุดจะถูกหักจากเงินเดือนเมื่ออนุมัติ)`,
      showCancelButton: true,
      confirmButtonText: "ขอเบิก",
      cancelButtonText: "ปิด",
      confirmButtonColor: "#16a34a",
    });
    if (!confirm.isConfirmed) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/mobile/uniform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart.map((l) => ({ productCode: l.productCode, qty: Number(l.qty) })), remark }),
      });
      const body = await res.json();
      if (!res.ok) {
        notify({ ok: false, text: body.message || body.error || "ส่งคำขอไม่สำเร็จ" });
        return;
      }
      notify({ ok: true, text: `ขอเบิกแล้ว (เลขที่ ${body.documentNo}) — รอผู้อนุมัติพิจารณา` });
      setCart([]);
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
      const res = await fetch(`/api/mobile/uniform/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
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

  return (
    <div className="mt-5 space-y-5">
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="font-medium text-gray-900">เลือกชุด/สินค้าที่ต้องการซื้อ</h2>
        <div className="mt-3 space-y-3">
          <label className="block text-sm text-gray-700">
            สินค้า
            <select className={`${inputCls} mt-1`} value={productCode} onChange={(e) => setProductCode(e.target.value)}>
              <option value="">- เลือกสินค้า -</option>
              {data.products.map((p) => (
                <option key={p.productCode} value={p.productCode}>
                  {p.productName} — {baht(p.unitPrice)} บาท{p.unit ? `/${p.unit}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-gray-700">
            จำนวน
            <input type="number" inputMode="numeric" min="1" step="1" className={`${inputCls} mt-1`} value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          <button type="button" onClick={addToCart} disabled={!productCode || !(Number(qty) > 0)} className="w-full rounded border border-blue-600 px-4 py-2 text-base font-medium text-blue-600 disabled:opacity-50">
            + เพิ่มลงรายการ
          </button>
        </div>

        {cart.length > 0 && (
          <div className="mt-4">
            <ul className="divide-y divide-gray-100 text-sm">
              {cart.map((l) => (
                <li key={l.productCode} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <div className="text-gray-900">{nameOf(l.productCode)}</div>
                    <div className="text-gray-500">
                      {l.qty} × {baht(priceOf(l.productCode))} = {baht(priceOf(l.productCode) * Number(l.qty))} บาท
                    </div>
                  </div>
                  <button type="button" onClick={() => setCart((c) => c.filter((x) => x !== l))} className="text-red-600">
                    ลบ
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-sm font-medium text-gray-900">
              <span>รวมทั้งหมด</span>
              <span>{baht(cartTotal)} บาท</span>
            </div>
            <label className="mt-3 block text-sm text-gray-700">
              หมายเหตุ (ถ้ามี)
              <input className={`${inputCls} mt-1`} value={remark} maxLength={300} onChange={(e) => setRemark(e.target.value)} />
            </label>
            <button type="button" onClick={submit} disabled={busy} className="mt-3 w-full rounded bg-blue-600 px-4 py-3 text-base font-medium text-white disabled:opacity-50">
              ขอเบิก
            </button>
          </div>
        )}
      </section>

      {message && <p className={`rounded p-3 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>}

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="font-medium text-gray-900">รายการที่เคยขอ</h2>
        <ul className="mt-3 divide-y divide-gray-100">
          {data.requests.length === 0 && <li className="py-3 text-sm text-gray-500">ยังไม่มีรายการ</li>}
          {data.requests.map((r) => {
            const rejected = r.status === "DRAFT" && !!r.rejectReason;
            const label = rejected ? "ไม่อนุมัติ" : r.status === "APPROVED" ? "อนุมัติแล้ว" : r.status === "SUBMITTED" ? "รออนุมัติ" : "แบบร่าง";
            return (
              <li key={r.issueHeaderId} className="py-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-gray-900">{baht(r.total)} บาท</div>
                    <div className="text-gray-600">{fmtDate(r.requestDate)}</div>
                    {r.documentNo && <div className="text-xs text-gray-400">เลขที่ {r.documentNo}</div>}
                    <div className="mt-1 text-xs text-gray-500">{r.lines.map((l) => `${l.productName} ×${l.qty}`).join(", ")}</div>
                  </div>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${rejected ? "bg-red-50 text-red-600" : r.status === "APPROVED" ? "bg-green-50 text-green-700" : r.status === "SUBMITTED" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                    {label}
                  </span>
                </div>
                {rejected && <div className="mt-1 text-xs text-red-600">เหตุผลที่ไม่อนุมัติ: {r.rejectReason}</div>}
                <div className="mt-2 flex gap-2">
                  {r.status === "DRAFT" && (
                    <button type="button" disabled={busy} onClick={() => act(r.issueHeaderId, "SUBMIT", r.documentNo)} className="rounded bg-green-600 px-3 py-1.5 text-white disabled:opacity-50">
                      ขอเบิกอีกครั้ง
                    </button>
                  )}
                  {(r.status === "DRAFT" || r.status === "SUBMITTED") && (
                    <button type="button" disabled={busy} onClick={() => act(r.issueHeaderId, "CANCEL", r.documentNo)} className="rounded border border-red-300 px-3 py-1.5 text-red-600 disabled:opacity-50">
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
