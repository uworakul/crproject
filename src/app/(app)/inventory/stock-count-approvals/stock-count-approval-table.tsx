"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";

export type DocType = "STOCKCOUNT" | "PURCHASE" | "TRANSFER" | "ISSUE" | "RETURN";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  STOCKCOUNT: "ตรวจนับสต๊อก",
  PURCHASE: "ซื้อสินค้า",
  TRANSFER: "โอนสินค้า",
  ISSUE: "จำหน่าย",
  RETURN: "คืนสินค้า",
};

export interface UnifiedRow {
  docType: DocType;
  headerId: number;
  documentNo: string | null;
  warehouseLabel: string;
  date: string;
  remark: string | null;
  itemCount: number;
  submittedDate: string | null;
  detailPath: string;
  apiBase: string;
  canApprove: boolean;
  empCode: string | null;
  empName: string | null;
  totalAmount: number | null;
}

type SortKey = "docType" | "documentNo" | "warehouseLabel" | "date" | "itemCount" | "submittedDate" | "empCode" | "totalAmount";

const NUMERIC_KEYS: SortKey[] = ["itemCount", "totalAmount"];
const DATE_KEYS: SortKey[] = ["date", "submittedDate"];

function money(v: number) {
  return v.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function rowKey(r: UnifiedRow) {
  return `${r.docType}::${r.headerId}`;
}

function label(r: UnifiedRow) {
  return `${DOC_TYPE_LABELS[r.docType]} ${r.documentNo ? `#${r.documentNo}` : `(เอกสาร #${r.headerId})`}`;
}

async function confirmApprove(l: string): Promise<boolean> {
  const result = await Swal.fire({
    html: `ยืนยันอนุมัติเอกสาร ${l}?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#16a34a",
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

async function confirmReject(l: string): Promise<string | null> {
  const { value, isConfirmed } = await Swal.fire({
    title: `ไม่อนุมัติเอกสาร ${l}`,
    input: "text",
    inputLabel: "ระบุเหตุผลที่ไม่อนุมัติ",
    inputPlaceholder: "เช่น นับจำนวนผิด, ต้องตรวจซ้ำ ฯลฯ",
    inputValidator: (v) => (!v || !v.trim() ? "กรุณาระบุเหตุผลที่ไม่อนุมัติ" : undefined),
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยันไม่อนุมัติ",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#9ca3af",
  });
  return isConfirmed && typeof value === "string" ? value.trim() : null;
}

export default function StockApprovalTable({ rows }: { rows: UnifiedRow[] }) {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<DocType | "">("");
  const [sortKey, setSortKey] = useState<SortKey>("submittedDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function compare(a: UnifiedRow, b: UnifiedRow) {
    if (NUMERIC_KEYS.includes(sortKey)) return Number(a[sortKey]) - Number(b[sortKey]);
    if (DATE_KEYS.includes(sortKey)) {
      const av = a[sortKey] ? new Date(a[sortKey] as string).getTime() : 0;
      const bv = b[sortKey] ? new Date(b[sortKey] as string).getTime() : 0;
      return av - bv;
    }
    if (sortKey === "docType") return DOC_TYPE_LABELS[a.docType].localeCompare(DOC_TYPE_LABELS[b.docType], "th");
    const av = String(a[sortKey] ?? "");
    const bv = String(b[sortKey] ?? "");
    return av.localeCompare(bv, "th");
  }

  const visibleRows = rows
    .filter((r) => !typeFilter || r.docType === typeFilter)
    .sort((a, b) => {
      const cmp = compare(a, b);
      return sortDir === "asc" ? cmp : -cmp;
    });

  async function approve(r: UnifiedRow) {
    if (!(await confirmApprove(label(r)))) return;
    setMessage(null);
    setPendingKey(rowKey(r));
    try {
      const res = await fetch(`${r.apiBase}/approve`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      router.refresh();
    } finally {
      setPendingKey(null);
    }
  }

  async function reject(r: UnifiedRow) {
    const reason = await confirmReject(label(r));
    if (!reason) return;
    setMessage(null);
    setPendingKey(rowKey(r));
    try {
      const res = await fetch(`${r.apiBase}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      router.refresh();
    } finally {
      setPendingKey(null);
    }
  }

  const headers: { key: SortKey; label: string; align?: "right" }[] = [
    { key: "docType", label: "ประเภทเอกสาร" },
    { key: "documentNo", label: "เลขที่เอกสาร" },
    { key: "warehouseLabel", label: "คลัง" },
    { key: "empCode", label: "พนักงาน" },
    { key: "date", label: "วันที่เอกสาร" },
    { key: "itemCount", label: "จำนวนรายการ", align: "right" },
    { key: "totalAmount", label: "ยอดเงิน", align: "right" },
    { key: "submittedDate", label: "ส่งเมื่อ" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          ประเภทเอกสาร
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as DocType | "")}
            className="w-56 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          >
            <option value="">- ทั้งหมด -</option>
            {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((dt) => (
              <option key={dt} value={dt}>
                {DOC_TYPE_LABELS[dt]}
              </option>
            ))}
          </select>
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
                  className={`cursor-pointer select-none px-3 py-2 font-medium hover:text-gray-900 ${h.align === "right" ? "text-right" : ""}`}
                >
                  {h.label}
                  {sortKey === h.key && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
                </th>
              ))}
              <th className="px-3 py-2">หมายเหตุ</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => {
              const busy = pendingKey === rowKey(r);
              return (
                <tr key={rowKey(r)} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-500">{DOC_TYPE_LABELS[r.docType]}</td>
                  <td className="px-3 py-2">
                    <Link href={r.detailPath} className="text-gray-900 hover:underline">
                      {r.documentNo ?? `#${r.headerId}`}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{r.warehouseLabel}</td>
                  <td className="px-3 py-2 text-gray-500">{r.empCode ? `${r.empCode} — ${r.empName}` : "-"}</td>
                  <td className="px-3 py-2 text-gray-500">{new Date(r.date).toLocaleDateString("th-TH")}</td>
                  <td className="px-3 py-2 text-right">{r.itemCount}</td>
                  <td className="px-3 py-2 text-right">{r.totalAmount !== null ? money(r.totalAmount) : "-"}</td>
                  <td className="px-3 py-2 text-gray-500">{r.submittedDate ? new Date(r.submittedDate).toLocaleString("th-TH") : "-"}</td>
                  <td className="px-3 py-2 text-gray-500">{r.remark ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {r.canApprove && (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => approve(r)}
                          disabled={busy}
                          className="rounded-md bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          อนุมัติ
                        </button>
                        <button
                          onClick={() => reject(r)}
                          disabled={busy}
                          className="rounded-md border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          ไม่อนุมัติ
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={headers.length + 2} className="px-3 py-6 text-center text-gray-400">
                  ไม่มีรายการรออนุมัติ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
