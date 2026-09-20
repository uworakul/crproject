"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Swal from "sweetalert2";
import SearchableSelect from "../../../../searchable-select";

async function confirmDialog(html: string) {
  const result = await Swal.fire({
    html,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#16a34a",
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

async function confirmReject(): Promise<string | null> {
  const { value, isConfirmed } = await Swal.fire({
    title: "ตีกลับเอกสารตรวจนับสต๊อก",
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

async function confirmDeleteLine(label: string): Promise<boolean> {
  const result = await Swal.fire({
    html: `ยืนยันลบรายการ ${label}?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

interface DetailRow {
  StockCountDetailID: number;
  ProductCode: string;
  CountedQty: string;
  CountedSecondHandQty: string;
  Product: { ProductName: string; UnitOfMeasure: string | null };
}

interface StockCountDoc {
  StockCountHeaderID: number;
  DocumentNo: string | null;
  WarehouseCode: string;
  Warehouse: { WarehouseName: string };
  CountDate: string;
  Remark: string | null;
  Status: string;
  RejectReason: string | null;
  Details: DetailRow[];
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "แบบร่าง",
  SUBMITTED: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
};

function qtyText(v: string) {
  return Number(v).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function StockCountDetailView({
  stockCount,
  canSave,
  canApprove,
  products,
  currentQtyByProduct,
  currentSecondHandByProduct,
}: {
  stockCount: StockCountDoc;
  canSave: boolean;
  canApprove: boolean;
  products: { ProductCode: string; ProductName: string }[];
  currentQtyByProduct: Record<string, string>;
  currentSecondHandByProduct: Record<string, string>;
}) {
  const router = useRouter();
  const [remark, setRemark] = useState(stockCount.Remark ?? "");
  const [newRow, setNewRow] = useState({ productCode: "", countedQty: "", countedSecondHandQty: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ countedQty: "", countedSecondHandQty: "" });
  const [message, setMessage] = useState<string | null>(null);

  async function call(path: string, opts?: RequestInit) {
    setMessage(null);
    const res = await fetch(`/api/inventory/stock-counts/${stockCount.StockCountHeaderID}${path}`, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return false;
    }
    router.refresh();
    return true;
  }

  async function saveRemark() {
    await call("", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ remark }) });
  }

  async function addRow() {
    if (!newRow.productCode.trim() || !newRow.countedQty) return;
    const existingIndex = stockCount.Details.findIndex((d) => d.ProductCode === newRow.productCode);
    if (existingIndex !== -1) {
      setMessage(`มีรายการนี้แล้ว ในลำดับที่ ${existingIndex + 1}`);
      return;
    }
    const ok = await call("/details", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newRow) });
    if (ok) setNewRow({ productCode: "", countedQty: "", countedSecondHandQty: "" });
  }

  function startEdit(d: DetailRow) {
    setEditingId(d.StockCountDetailID);
    setEditForm({ countedQty: d.CountedQty, countedSecondHandQty: d.CountedSecondHandQty });
  }

  // Line edit/delete use a flat endpoint keyed by StockCountDetailID alone
  // (not nested under the header) — see the comment in
  // src/app/api/inventory/stock-count-details/[detailId]/route.ts for why.
  async function callDetail(detailId: number, opts?: RequestInit) {
    setMessage(null);
    const res = await fetch(`/api/inventory/stock-count-details/${detailId}`, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return false;
    }
    router.refresh();
    return true;
  }

  async function saveEdit(detailId: number) {
    const ok = await callDetail(detailId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (ok) setEditingId(null);
  }

  async function deleteRow(d: DetailRow) {
    if (!(await confirmDeleteLine(`${d.ProductCode} — ${d.Product.ProductName}`))) return;
    await callDetail(d.StockCountDetailID, { method: "DELETE" });
  }

  const canEditRows = canSave && stockCount.Status !== "APPROVED";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-gray-500">เลขที่เอกสาร</div>
          <div>{stockCount.DocumentNo ?? "-"}</div>
        </div>
        <div>
          <div className="text-gray-500">คลัง</div>
          <div>
            {stockCount.WarehouseCode} — {stockCount.Warehouse.WarehouseName}
          </div>
        </div>
        <div>
          <div className="text-gray-500">วันที่ตรวจนับ</div>
          <div>{new Date(stockCount.CountDate).toLocaleDateString("th-TH")}</div>
        </div>
        <div>
          <div className="text-gray-500">สถานะ</div>
          <div>{STATUS_LABEL[stockCount.Status] ?? stockCount.Status}</div>
        </div>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-gray-500">หมายเหตุ</span>
          <div className="flex gap-2">
            <input
              disabled={!canEditRows}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
            />
            {canEditRows && (
              <button onClick={saveRemark} className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
                บันทึก
              </button>
            )}
          </div>
        </label>
      </div>

      {stockCount.RejectReason && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">ถูกตีกลับ: {stockCount.RejectReason}</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">ลำดับที่</th>
              <th className="px-3 py-2 font-medium">รหัสสินค้า</th>
              <th className="px-3 py-2 font-medium">ชื่อสินค้า</th>
              <th className="px-3 py-2 font-medium text-right">ยอดปัจจุบัน</th>
              <th className="px-3 py-2 font-medium text-right">จำนวนที่นับได้</th>
              <th className="px-3 py-2 font-medium text-right">มือสองปัจจุบัน</th>
              <th className="px-3 py-2 font-medium text-right">จำนวนสินค้ามือสองที่นับได้</th>
              <th className="px-3 py-2 font-medium">หน่วยนับ</th>
              {canEditRows && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {stockCount.Details.map((d, i) => {
              const isEditing = editingId === d.StockCountDetailID;
              return (
                <tr key={d.StockCountDetailID} className="border-t border-gray-100 hover:bg-purple-50">
                  <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                  <td className="px-3 py-2">{d.ProductCode}</td>
                  <td className="px-3 py-2">{d.Product.ProductName}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{qtyText(currentQtyByProduct[d.ProductCode] ?? "0")}</td>
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <input
                        type="number"
                        step="any"
                        value={editForm.countedQty}
                        onChange={(e) => setEditForm({ ...editForm, countedQty: e.target.value })}
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                      />
                    ) : (
                      qtyText(d.CountedQty)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500">{qtyText(currentSecondHandByProduct[d.ProductCode] ?? "0")}</td>
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <input
                        type="number"
                        step="any"
                        value={editForm.countedSecondHandQty}
                        onChange={(e) => setEditForm({ ...editForm, countedSecondHandQty: e.target.value })}
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                      />
                    ) : (
                      qtyText(d.CountedSecondHandQty)
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{d.Product.UnitOfMeasure ?? "-"}</td>
                  {canEditRows && (
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => saveEdit(d.StockCountDetailID)} className="text-gray-900 hover:underline">
                            บันทึก
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-gray-400 hover:underline">
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => startEdit(d)} className="text-gray-500 hover:text-gray-900 hover:underline">
                            แก้ไข
                          </button>
                          <button onClick={() => deleteRow(d)} className="text-red-500 hover:underline">
                            ลบ
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {stockCount.Details.length === 0 && (
              <tr>
                <td colSpan={canEditRows ? 9 : 8} className="px-3 py-6 text-center text-gray-400">
                  ยังไม่มีรายการสินค้า
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEditRows && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 p-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            สินค้า
            <div className="w-64">
              <SearchableSelect
                value={newRow.productCode}
                onChange={(code) => setNewRow({ ...newRow, productCode: code })}
                options={products.map((p) => ({ code: p.ProductCode, label: `${p.ProductCode} — ${p.ProductName}` }))}
                placeholder="ค้นหารหัส/ชื่อสินค้า"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            จำนวนที่นับได้
            <input
              type="number"
              step="any"
              value={newRow.countedQty}
              onChange={(e) => setNewRow({ ...newRow, countedQty: e.target.value })}
              className="w-28 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            จำนวนสินค้ามือสองที่นับได้
            <input
              type="number"
              step="any"
              value={newRow.countedSecondHandQty}
              onChange={(e) => setNewRow({ ...newRow, countedSecondHandQty: e.target.value })}
              className="w-28 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <button
            onClick={addRow}
            disabled={stockCount.Details.some((d) => d.ProductCode === newRow.productCode)}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            + เพิ่มรายการ
          </button>
        </div>
      )}

      <div className="flex items-center justify-between rounded bg-gray-50 p-3 text-sm">
        <span>จำนวนรายการทั้งหมด {stockCount.Details.length} รายการ</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {stockCount.Status === "DRAFT" && canSave && (
          <button onClick={() => call("/submit", { method: "POST" })} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
            ส่งอนุมัติ
          </button>
        )}
        {stockCount.Status === "SUBMITTED" && canApprove && (
          <>
            <button
              onClick={async () => {
                if (
                  !(await confirmDialog(
                    `ยืนยันอนุมัติเอกสารตรวจนับสต๊อก ${stockCount.DocumentNo ? `#${stockCount.DocumentNo}` : ""} คลัง ${stockCount.WarehouseCode} จำนวน ${stockCount.Details.length} รายการ?`,
                  ))
                )
                  return;
                await call("/approve", { method: "POST" });
              }}
              className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
            >
              อนุมัติ
            </button>
            <button
              onClick={async () => {
                const reason = await confirmReject();
                if (!reason) return;
                await call("/reject", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
              }}
              className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              ตีกลับ
            </button>
          </>
        )}
        {stockCount.Status === "APPROVED" && <p className="text-sm text-gray-500">อนุมัติแล้ว ยอดคงเหลือถูกปรับปรุงเรียบร้อย ไม่สามารถแก้ไขได้</p>}
      </div>

      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
