"use client";

import { useState } from "react";
import SearchableSelect from "../searchable-select";

interface StockCardRow {
  movementId: number;
  movementDate: string;
  movementType: string;
  movementTypeLabel: string;
  direction: "IN" | "OUT";
  qty: string;
  unitPrice: string;
  amount: string;
  counterWarehouseCode: string | null;
  counterWarehouseName: string | null;
  balanceQty: string;
  balanceAmount: string;
}

interface StockCardResult {
  warehouseCode: string;
  warehouseName: string;
  productCode: string;
  productName: string;
  opening: { qty: string; amount: string };
  closing: { qty: string; amount: string };
  rows: StockCardRow[];
}

function money(v: string | number) {
  return Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}
function qty(v: string | number) {
  return Number(v).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function thaiDate(v: string) {
  return new Date(v).toLocaleDateString("th-TH");
}
function movementLabel(r: StockCardRow) {
  if (r.movementType === "TRANSFER" && r.counterWarehouseName) {
    return r.direction === "IN" ? `โอนเข้า (จาก ${r.counterWarehouseName})` : `โอนออก (ไปยัง ${r.counterWarehouseName})`;
  }
  // "ตรวจนับสต๊อก" ("IN 100") on its own reads like a receipt of 100 units —
  // it's really "the count found a difference of 100 from the ledger"
  // (approveWorksheet's Qty for this movement type is already
  // CountedQty-currentQty, not the raw counted total; see
  // stock-counts/[id]/approve/route.ts). Spelling out "ปรับเพิ่ม/ปรับลด"
  // makes that distinction visible without the reader needing to know that.
  if (r.movementType === "ADJUST") {
    return r.direction === "IN" ? "ตรวจนับสต๊อก (ปรับเพิ่ม)" : "ตรวจนับสต๊อก (ปรับลด)";
  }
  return r.movementTypeLabel;
}

export default function StockCardView({
  companies,
  warehouses,
  products,
}: {
  companies: { code: string; label: string }[];
  warehouses: { code: string; label: string; companyCode: string | null }[];
  products: { code: string; label: string }[];
}) {
  const [companyCode, setCompanyCode] = useState("");
  const [warehouseCode, setWarehouseCode] = useState("");
  const [productCode, setProductCode] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<StockCardResult | null>(null);

  const filteredWarehouses = companyCode ? warehouses.filter((w) => w.companyCode === companyCode) : warehouses;

  async function handleSearch() {
    setMessage(null);
    if (!warehouseCode || !productCode || !startDate || !endDate) {
      setMessage("กรุณาเลือกคลัง สินค้า และช่วงวันที่ให้ครบถ้วน");
      setResult(null);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ warehouseCode, productCode, startDate, endDate });
      const res = await fetch(`/api/inventory/stock-card?${params.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        setResult(null);
        return;
      }
      setResult(body);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          บริษัท
          <select
            value={companyCode}
            onChange={(e) => {
              setCompanyCode(e.target.value);
              // narrowing company can strand a previously-picked warehouse
              // outside the new option list — clear it so the form can't
              // silently keep searching against a hidden selection.
              if (warehouseCode && !warehouses.some((w) => w.code === warehouseCode && (!e.target.value || w.companyCode === e.target.value))) {
                setWarehouseCode("");
              }
            }}
            className="w-56 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          >
            <option value="">- ทั้งหมด -</option>
            {companies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          คลัง
          <select value={warehouseCode} onChange={(e) => setWarehouseCode(e.target.value)} className="w-56 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900">
            <option value="">- เลือกคลัง -</option>
            {filteredWarehouses.map((w) => (
              <option key={w.code} value={w.code}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          รหัสสินค้า
          <div className="w-56">
            <SearchableSelect value={productCode} onChange={setProductCode} options={products} placeholder="ค้นหารหัส/ชื่อสินค้า" />
          </div>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          วันที่เริ่มต้น
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          วันที่สิ้นสุด
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
        </label>
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          className="rounded-md bg-gray-900 px-4 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? "กำลังค้นหา..." : "ค้นหา"}
        </button>
      </div>

      {message && <p className="text-sm text-red-600">{message}</p>}

      {result && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-gray-600">
            {result.warehouseCode} — {result.warehouseName} | {result.productCode} — {result.productName}
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">วันที่</th>
                  <th className="px-3 py-2 font-medium">รายการเคลื่อนไหว</th>
                  <th className="px-3 py-2 text-right font-medium">จำนวนเข้า</th>
                  <th className="px-3 py-2 text-right font-medium">มูลค่าเข้า</th>
                  <th className="px-3 py-2 text-right font-medium">จำนวนออก</th>
                  <th className="px-3 py-2 text-right font-medium">มูลค่าออก</th>
                  <th className="px-3 py-2 text-right font-medium">คงเหลือ (จำนวน)</th>
                  <th className="px-3 py-2 text-right font-medium">คงเหลือ (มูลค่า)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-100 bg-gray-50 font-medium">
                  <td className="px-3 py-2" colSpan={2}>
                    ยอดยกมา
                  </td>
                  <td className="px-3 py-2 text-right text-gray-400">-</td>
                  <td className="px-3 py-2 text-right text-gray-400">-</td>
                  <td className="px-3 py-2 text-right text-gray-400">-</td>
                  <td className="px-3 py-2 text-right text-gray-400">-</td>
                  <td className="px-3 py-2 text-right">{qty(result.opening.qty)}</td>
                  <td className="px-3 py-2 text-right">{money(result.opening.amount)}</td>
                </tr>
                {result.rows.map((r) => (
                  <tr key={r.movementId} className="border-t border-gray-100 hover:bg-purple-50">
                    <td className="px-3 py-2">{thaiDate(r.movementDate)}</td>
                    <td className="px-3 py-2">{movementLabel(r)}</td>
                    <td className="px-3 py-2 text-right">{r.direction === "IN" ? qty(r.qty) : "-"}</td>
                    <td className="px-3 py-2 text-right">{r.direction === "IN" ? money(r.amount) : "-"}</td>
                    <td className="px-3 py-2 text-right">{r.direction === "OUT" ? qty(r.qty) : "-"}</td>
                    <td className="px-3 py-2 text-right">{r.direction === "OUT" ? money(r.amount) : "-"}</td>
                    <td className="px-3 py-2 text-right">{qty(r.balanceQty)}</td>
                    <td className="px-3 py-2 text-right">{money(r.balanceAmount)}</td>
                  </tr>
                ))}
                {result.rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-gray-400">
                      ไม่มีการเคลื่อนไหวในช่วงวันที่เลือก
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
