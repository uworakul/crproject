"use client";

import { useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";

async function confirmDeleteStockTransfer(label: string): Promise<boolean> {
  const result = await Swal.fire({
    html: `ยืนยันการลบเอกสาร ${label}?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

interface HeaderRow {
  TransferHeaderID: number;
  DocumentNo: string | null;
  SourceWarehouseCode: string;
  SourceWarehouse: { WarehouseName: string };
  TargetWarehouseCode: string;
  TargetWarehouse: { WarehouseName: string };
  DeliveryNo: string | null;
  DeliveryDate: string;
  Remark: string | null;
  Status: string;
  Details: { TransferDetailID: number }[];
}

const STATUS_LABEL: Record<string, string> = { DRAFT: "แบบร่าง", SUBMITTED: "รออนุมัติ", APPROVED: "อนุมัติแล้ว" };

function label(r: HeaderRow) {
  return `${r.DocumentNo ? `#${r.DocumentNo}` : `(เอกสาร #${r.TransferHeaderID})`}`;
}

export default function StockTransferListView({
  initialRows,
  warehouses,
  canSave,
  canDelete,
}: {
  initialRows: HeaderRow[];
  warehouses: { WarehouseCode: string; WarehouseName: string }[];
  canSave: boolean;
  canDelete: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [form, setForm] = useState({
    sourceWarehouseCode: warehouses[0]?.WarehouseCode ?? "",
    targetWarehouseCode: warehouses[1]?.WarehouseCode ?? "",
    deliveryNo: "",
    deliveryDate: new Date().toISOString().slice(0, 10),
    remark: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function refresh() {
    const res = await fetch("/api/inventory/stock-transfers");
    if (res.ok) setRows(await res.json());
  }

  async function handleDelete(r: HeaderRow) {
    if (!(await confirmDeleteStockTransfer(label(r)))) return;
    setMessage(null);
    const res = await fetch(`/api/inventory/stock-transfers/${r.TransferHeaderID}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    await refresh();
  }

  async function handleCreate() {
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/inventory/stock-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      await refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">เลขที่เอกสาร</th>
              <th className="px-3 py-2 font-medium">คลังต้นทาง</th>
              <th className="px-3 py-2 font-medium">คลังปลายทาง</th>
              <th className="px-3 py-2 font-medium">เลขที่ใบส่งสินค้า</th>
              <th className="px-3 py-2 font-medium">วันที่ส่งสินค้า</th>
              <th className="px-3 py-2 font-medium text-right">จำนวนรายการ</th>
              <th className="px-3 py-2 font-medium">สถานะ</th>
              {canDelete && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.TransferHeaderID} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2">
                  <Link href={`/inventory/transactions/transfer/${r.TransferHeaderID}`} className="text-gray-900 hover:underline">
                    {r.DocumentNo ?? `#${r.TransferHeaderID}`}
                  </Link>
                </td>
                <td className="px-3 py-2 text-gray-500">
                  {r.SourceWarehouseCode} — {r.SourceWarehouse.WarehouseName}
                </td>
                <td className="px-3 py-2 text-gray-500">
                  {r.TargetWarehouseCode} — {r.TargetWarehouse.WarehouseName}
                </td>
                <td className="px-3 py-2 text-gray-500">{r.DeliveryNo ?? "-"}</td>
                <td className="px-3 py-2 text-gray-500">{new Date(r.DeliveryDate).toLocaleDateString("th-TH")}</td>
                <td className="px-3 py-2 text-right">{r.Details.length}</td>
                <td className="px-3 py-2">{STATUS_LABEL[r.Status] ?? r.Status}</td>
                {canDelete && (
                  <td className="px-3 py-2 text-right">
                    {r.Status === "DRAFT" && (
                      <button onClick={() => handleDelete(r)} className="text-red-500 hover:underline">
                        ลบ
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canDelete ? 8 : 7} className="px-3 py-6 text-center text-gray-400">
                  ยังไม่มีเอกสารโอนสินค้า
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canSave && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 p-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            คลังต้นทาง
            <select
              value={form.sourceWarehouseCode}
              onChange={(e) => setForm({ ...form, sourceWarehouseCode: e.target.value })}
              className="w-40 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            >
              {warehouses.map((w) => (
                <option key={w.WarehouseCode} value={w.WarehouseCode}>
                  {w.WarehouseCode} — {w.WarehouseName}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            คลังปลายทาง
            <select
              value={form.targetWarehouseCode}
              onChange={(e) => setForm({ ...form, targetWarehouseCode: e.target.value })}
              className="w-40 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            >
              {warehouses.map((w) => (
                <option key={w.WarehouseCode} value={w.WarehouseCode}>
                  {w.WarehouseCode} — {w.WarehouseName}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            เลขที่ใบส่งสินค้า
            <input
              value={form.deliveryNo}
              onChange={(e) => setForm({ ...form, deliveryNo: e.target.value })}
              className="w-36 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            วันที่ส่งสินค้า
            <input
              type="date"
              value={form.deliveryDate}
              onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })}
              className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            หมายเหตุ
            <input
              value={form.remark}
              onChange={(e) => setForm({ ...form, remark: e.target.value })}
              className="w-40 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <button
            onClick={handleCreate}
            disabled={pending || !form.sourceWarehouseCode || !form.targetWarehouseCode || form.sourceWarehouseCode === form.targetWarehouseCode}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            + สร้างเอกสาร
          </button>
        </div>
      )}
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
