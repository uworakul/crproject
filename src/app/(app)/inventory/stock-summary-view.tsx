"use client";

import { useState } from "react";

export interface StockSummaryRow {
  warehouseCode: string;
  warehouseName: string;
  categoryCode: string | null;
  categoryName: string | null;
  productCode: string;
  productName: string;
  qty: string; // computed live from the confirmed movement ledger — read-only
  secondHandQty: string; // manually tracked, separate small table
  secondhandStockId: number | null;
  unitOfMeasure: string | null;
}

type SortKey = "warehouseCode" | "warehouseName" | "categoryName" | "productCode" | "productName" | "qty" | "secondHandQty" | "unitOfMeasure";

const NUMERIC_KEYS: SortKey[] = ["qty", "secondHandQty"];

function compare(a: StockSummaryRow, b: StockSummaryRow, key: SortKey) {
  if (NUMERIC_KEYS.includes(key)) return Number(a[key]) - Number(b[key]);
  const av = a[key] ?? "";
  const bv = b[key] ?? "";
  return String(av).localeCompare(String(bv), "th");
}

function qtyText(v: string) {
  const n = Number(v);
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function StockSummaryView({
  initialRows,
  warehouses,
  categories,
}: {
  initialRows: StockSummaryRow[];
  warehouses: { code: string; label: string }[];
  categories: { code: string; label: string }[];
}) {
  const [rows] = useState(initialRows);
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [onlyWithRemaining, setOnlyWithRemaining] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("warehouseCode");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const searchNorm = search.trim().toLowerCase();
  const visibleRows = rows
    .filter((r) => !warehouseFilter || r.warehouseCode === warehouseFilter)
    .filter((r) => !categoryFilter || r.categoryCode === categoryFilter)
    .filter((r) => !searchNorm || r.productName.toLowerCase().includes(searchNorm) || r.productCode.toLowerCase().includes(searchNorm))
    .filter((r) => !onlyWithRemaining || Number(r.qty) > 0 || Number(r.secondHandQty) > 0)
    .sort((a, b) => {
      const cmp = compare(a, b, sortKey);
      return sortDir === "asc" ? cmp : -cmp;
    });

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const headers: { key: SortKey; label: string }[] = [
    { key: "warehouseCode", label: "รหัสคลัง" },
    { key: "warehouseName", label: "ชื่อคลัง" },
    { key: "categoryName", label: "หมวด" },
    { key: "productCode", label: "รหัสสินค้า" },
    { key: "productName", label: "ชื่อสินค้า" },
    { key: "qty", label: "จำนวน" },
    { key: "secondHandQty", label: "จำนวนสินค้ามือสอง" },
    { key: "unitOfMeasure", label: "หน่วยนับ" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          คลัง
          <select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="w-56 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          >
            <option value="">- ทั้งหมด -</option>
            {warehouses.map((w) => (
              <option key={w.code} value={w.code}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          หมวด
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-56 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          >
            <option value="">- ทั้งหมด -</option>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อ/รหัสสินค้า"
          className="w-56 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
        />
        <label className="flex items-center gap-2 pb-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={onlyWithRemaining} onChange={(e) => setOnlyWithRemaining(e.target.checked)} />
          แสดงเฉพาะที่มีคงเหลือ
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              {headers.map((h) => (
                <th
                  key={h.key}
                  onClick={() => handleSort(h.key)}
                  className={`cursor-pointer select-none px-3 py-2 font-medium hover:text-gray-900 ${NUMERIC_KEYS.includes(h.key) ? "text-right" : ""}`}
                >
                  {h.label}
                  {sortKey === h.key && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={`${r.warehouseCode}::${r.productCode}`} className="border-t border-gray-100 hover:bg-purple-50">
                <td className="px-3 py-2">{r.warehouseCode}</td>
                <td className="px-3 py-2">{r.warehouseName}</td>
                <td className="px-3 py-2 text-gray-500">{r.categoryName ?? "-"}</td>
                <td className="px-3 py-2">{r.productCode}</td>
                <td className="px-3 py-2">{r.productName}</td>
                <td className="px-3 py-2 text-right">{qtyText(r.qty)}</td>
                <td className="px-3 py-2 text-right">{qtyText(r.secondHandQty)}</td>
                <td className="px-3 py-2 text-gray-500">{r.unitOfMeasure ?? "-"}</td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="px-3 py-6 text-center text-gray-400">
                  {rows.length === 0 ? "ยังไม่มีข้อมูลสินค้าคงเหลือ" : "ไม่พบรายการที่ค้นหา"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
