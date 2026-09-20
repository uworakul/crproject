"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";

interface HeaderRow {
  StockCountHeaderID: number;
  DocumentNo: string | null;
  WarehouseCode: string;
  Warehouse: { WarehouseName: string };
  CountDate: string;
  Remark: string | null;
  SubmittedDate: string | null;
  Details: { StockCountDetailID: number }[];
}

function label(r: HeaderRow) {
  return `${r.DocumentNo ? `#${r.DocumentNo}` : `(เอกสาร #${r.StockCountHeaderID})`} คลัง ${r.WarehouseCode}`;
}

async function confirmApprove(l: string): Promise<boolean> {
  const result = await Swal.fire({
    html: `ยืนยันอนุมัติเอกสารตรวจนับสต๊อก ${l}?`,
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
    title: `ตีกลับเอกสารตรวจนับสต๊อก ${l}`,
    input: "text",
    inputLabel: "ระบุเหตุผลที่ตีกลับ",
    inputPlaceholder: "เช่น นับจำนวนผิด, ต้องตรวจซ้ำ ฯลฯ",
    inputValidator: (v) => (!v || !v.trim() ? "กรุณาระบุเหตุผลที่ตีกลับ" : undefined),
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยันตีกลับ",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#9ca3af",
  });
  return isConfirmed && typeof value === "string" ? value.trim() : null;
}

export default function StockCountApprovalTable({ rows, canApprove }: { rows: HeaderRow[]; canApprove: boolean }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function approve(r: HeaderRow) {
    if (!(await confirmApprove(label(r)))) return;
    setMessage(null);
    setPendingId(r.StockCountHeaderID);
    try {
      const res = await fetch(`/api/inventory/stock-counts/${r.StockCountHeaderID}/approve`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  async function reject(r: HeaderRow) {
    const reason = await confirmReject(label(r));
    if (!reason) return;
    setMessage(null);
    setPendingId(r.StockCountHeaderID);
    try {
      const res = await fetch(`/api/inventory/stock-counts/${r.StockCountHeaderID}/reject`, {
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
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">เลขที่เอกสาร</th>
              <th className="px-3 py-2 font-medium">คลัง</th>
              <th className="px-3 py-2 font-medium">วันที่ตรวจนับ</th>
              <th className="px-3 py-2 font-medium">หมายเหตุ</th>
              <th className="px-3 py-2 font-medium text-right">จำนวนรายการ</th>
              <th className="px-3 py-2 font-medium">ส่งเมื่อ</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const busy = pendingId === r.StockCountHeaderID;
              return (
                <tr key={r.StockCountHeaderID} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link href={`/inventory/transactions/count/${r.StockCountHeaderID}`} className="text-gray-900 hover:underline">
                      {r.DocumentNo ?? `#${r.StockCountHeaderID}`}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {r.WarehouseCode} — {r.Warehouse.WarehouseName}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{new Date(r.CountDate).toLocaleDateString("th-TH")}</td>
                  <td className="px-3 py-2 text-gray-500">{r.Remark ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{r.Details.length}</td>
                  <td className="px-3 py-2 text-gray-500">{r.SubmittedDate ? new Date(r.SubmittedDate).toLocaleString("th-TH") : "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {canApprove && (
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
                          ตีกลับ
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
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
