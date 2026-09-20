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
    title: "ตีกลับเอกสารคืนสินค้า",
    input: "text",
    inputLabel: "ระบุเหตุผลที่ตีกลับ",
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
  ReturnDetailID: number;
  ProductCode: string;
  IsSecondHand: boolean;
  Qty: string;
  UnitPrice: string;
  Amount: string;
  Product: { ProductName: string; UnitOfMeasure: string | null };
}

interface ReturnDoc {
  ReturnHeaderID: number;
  DocumentNo: string | null;
  WarehouseCode: string;
  Warehouse: { WarehouseName: string };
  EmpCode: string;
  Employee: { FullName: string; Site: { SiteName: string } | null };
  DeliveryNo: string | null;
  DeliveryDate: string;
  Remark: string | null;
  Status: string;
  RejectReason: string | null;
  Details: DetailRow[];
}

const STATUS_LABEL: Record<string, string> = { DRAFT: "แบบร่าง", SUBMITTED: "รออนุมัติ", APPROVED: "อนุมัติแล้ว" };

function money(v: string | number) {
  return Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default function StockReturnDetailView({
  stockReturn,
  canSave,
  canApprove,
  products,
}: {
  stockReturn: ReturnDoc;
  canSave: boolean;
  canApprove: boolean;
  products: { ProductCode: string; ProductName: string }[];
}) {
  const router = useRouter();
  const [deliveryNo, setDeliveryNo] = useState(stockReturn.DeliveryNo ?? "");
  const [remark, setRemark] = useState(stockReturn.Remark ?? "");
  const [newRow, setNewRow] = useState({ productCode: "", isSecondHand: false, qty: "", unitPrice: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ qty: "", unitPrice: "" });
  const [message, setMessage] = useState<string | null>(null);

  async function call(path: string, opts?: RequestInit) {
    setMessage(null);
    const res = await fetch(`/api/inventory/stock-returns/${stockReturn.ReturnHeaderID}${path}`, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return false;
    }
    router.refresh();
    return true;
  }

  async function callDetail(detailId: number, opts?: RequestInit) {
    setMessage(null);
    const res = await fetch(`/api/inventory/stock-return-details/${detailId}`, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return false;
    }
    router.refresh();
    return true;
  }

  async function saveHeader() {
    await call("", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deliveryNo, remark }) });
  }

  async function addRow() {
    if (!newRow.productCode.trim() || !newRow.qty || !newRow.unitPrice) return;
    const existingIndex = stockReturn.Details.findIndex((d) => d.ProductCode === newRow.productCode && d.IsSecondHand === newRow.isSecondHand);
    if (existingIndex !== -1) {
      setMessage(`มีรายการนี้แล้ว ในลำดับที่ ${existingIndex + 1}`);
      return;
    }
    const ok = await call("/details", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newRow) });
    if (ok) setNewRow({ productCode: "", isSecondHand: false, qty: "", unitPrice: "" });
  }

  function startEdit(d: DetailRow) {
    setEditingId(d.ReturnDetailID);
    setEditForm({ qty: d.Qty, unitPrice: d.UnitPrice });
  }

  async function saveEdit(detailId: number) {
    const ok = await callDetail(detailId, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editForm) });
    if (ok) setEditingId(null);
  }

  async function deleteRow(d: DetailRow) {
    if (!(await confirmDeleteLine(`${d.ProductCode} — ${d.Product.ProductName}`))) return;
    await callDetail(d.ReturnDetailID, { method: "DELETE" });
  }

  const canEditRows = canSave && stockReturn.Status !== "APPROVED";
  const totalAmount = stockReturn.Details.reduce((sum, d) => sum + Number(d.Amount), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-gray-500">เลขที่เอกสาร</div>
          <div>{stockReturn.DocumentNo ?? "-"}</div>
        </div>
        <div>
          <div className="text-gray-500">สถานะ</div>
          <div>{STATUS_LABEL[stockReturn.Status] ?? stockReturn.Status}</div>
        </div>
        <div>
          <div className="text-gray-500">คลังที่รับคืน</div>
          <div>
            {stockReturn.WarehouseCode} — {stockReturn.Warehouse.WarehouseName}
          </div>
        </div>
        <div>
          <div className="text-gray-500">พนักงาน / หน่วยงานต้นสังกัด</div>
          <div>
            {stockReturn.EmpCode} — {stockReturn.Employee.FullName} ({stockReturn.Employee.Site?.SiteName ?? "-"})
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-gray-500">เลขที่ใบส่งสินค้า</span>
          <input
            disabled={!canEditRows}
            value={deliveryNo}
            onChange={(e) => setDeliveryNo(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
          />
        </label>
        <div>
          <div className="text-gray-500">วันที่ส่งสินค้า</div>
          <div>{new Date(stockReturn.DeliveryDate).toLocaleDateString("th-TH")}</div>
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
              <button onClick={saveHeader} className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
                บันทึก
              </button>
            )}
          </div>
        </label>
      </div>

      {stockReturn.RejectReason && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">ถูกตีกลับ: {stockReturn.RejectReason}</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">ลำดับที่</th>
              <th className="px-3 py-2 font-medium">รหัสสินค้า</th>
              <th className="px-3 py-2 font-medium">ชื่อสินค้า</th>
              <th className="px-3 py-2 font-medium">ประเภท</th>
              <th className="px-3 py-2 font-medium text-right">จำนวน</th>
              <th className="px-3 py-2 font-medium text-right">ยอดรับคืนต่อหน่วย</th>
              <th className="px-3 py-2 font-medium text-right">ยอดเงิน</th>
              {canEditRows && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {stockReturn.Details.map((d, i) => {
              const isEditing = editingId === d.ReturnDetailID;
              const qty = isEditing ? Number(editForm.qty || 0) : Number(d.Qty);
              const unitPrice = isEditing ? Number(editForm.unitPrice || 0) : Number(d.UnitPrice);
              return (
                <tr key={d.ReturnDetailID} className="border-t border-gray-100 hover:bg-purple-50">
                  <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                  <td className="px-3 py-2">{d.ProductCode}</td>
                  <td className="px-3 py-2">{d.Product.ProductName}</td>
                  <td className="px-3 py-2 text-gray-500">{d.IsSecondHand ? "สินค้ามือสอง" : "สินค้า"}</td>
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <input
                        type="number"
                        step="any"
                        value={editForm.qty}
                        onChange={(e) => setEditForm({ ...editForm, qty: e.target.value })}
                        className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                      />
                    ) : (
                      qty.toLocaleString("th-TH")
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.unitPrice}
                        onChange={(e) => setEditForm({ ...editForm, unitPrice: e.target.value })}
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                      />
                    ) : (
                      money(unitPrice)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{money(qty * unitPrice)}</td>
                  {canEditRows && (
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => saveEdit(d.ReturnDetailID)} className="text-gray-900 hover:underline">
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
            {stockReturn.Details.length === 0 && (
              <tr>
                <td colSpan={canEditRows ? 8 : 7} className="px-3 py-6 text-center text-gray-400">
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
            ประเภท
            <select
              value={newRow.isSecondHand ? "second" : "regular"}
              onChange={(e) => setNewRow({ ...newRow, isSecondHand: e.target.value === "second" })}
              className="w-32 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            >
              <option value="regular">สินค้า</option>
              <option value="second">สินค้ามือสอง</option>
            </select>
          </label>
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
            จำนวน
            <input
              type="number"
              step="any"
              value={newRow.qty}
              onChange={(e) => setNewRow({ ...newRow, qty: e.target.value })}
              className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            ยอดรับคืนต่อหน่วย
            <input
              type="number"
              step="0.01"
              value={newRow.unitPrice}
              onChange={(e) => setNewRow({ ...newRow, unitPrice: e.target.value })}
              className="w-24 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <button
            onClick={addRow}
            disabled={stockReturn.Details.some((d) => d.ProductCode === newRow.productCode && d.IsSecondHand === newRow.isSecondHand)}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            + เพิ่มรายการ
          </button>
        </div>
      )}

      <div className="flex items-center justify-between rounded bg-gray-50 p-3 text-sm">
        <span>จำนวนรายการทั้งหมด {stockReturn.Details.length} รายการ</span>
        <span className="font-semibold">ยอดเงินรวม {money(totalAmount)} บาท</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {stockReturn.Status === "DRAFT" && canSave && (
          <button onClick={() => call("/submit", { method: "POST" })} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
            ส่งอนุมัติ
          </button>
        )}
        {stockReturn.Status === "SUBMITTED" && canApprove && (
          <>
            <button
              onClick={async () => {
                if (
                  !(await confirmDialog(
                    `ยืนยันอนุมัติเอกสารคืนสินค้า ${stockReturn.DocumentNo ? `#${stockReturn.DocumentNo}` : ""} จากพนักงาน ${stockReturn.EmpCode} ยอดรวม ${money(totalAmount)} บาท? (จะนำไปลดหนี้ UNIFORM ที่ค้างอยู่)`,
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
        {stockReturn.Status === "APPROVED" && <p className="text-sm text-gray-500">อนุมัติแล้ว ยอดคงเหลือและหนี้ถูกปรับปรุงเรียบร้อย ไม่สามารถแก้ไขได้</p>}
      </div>

      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
