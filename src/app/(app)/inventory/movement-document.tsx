"use client";

import { useState } from "react";

export type MovementType = "ADJUST" | "PURCHASE" | "TRANSFER" | "ISSUE" | "RETURN";

interface DetailLine {
  productCode: string;
  qty: string;
  unitPrice: string;
}

interface Movement {
  MovementID: number;
  MovementType: string;
  WarehouseCode: string;
  TargetWarehouseCode: string | null;
  SupplierCode: string | null;
  EmpCode: string | null;
  MovementDate: string;
  Status: string;
  Details: { DetailID: number; ProductCode: string; Qty: string; UnitPrice: string; Amount: string }[];
}

interface Debt {
  DebtID: number;
  EmpCode: string;
  RemainingAmount: string;
  Status: string;
}

interface Props {
  movementType: MovementType;
  apiDocType: string; // e.g. "STOCK_PURCHASE" — unused directly, kept for clarity of intent
  canSave: boolean;
  canApprove: boolean;
  canDelete: boolean;
  warehouses: { WarehouseCode: string; WarehouseName: string }[];
  suppliers: { SupplierCode: string; SupplierName: string }[];
  employees: { EmpCode: string; FullName: string }[];
  products: { ProductCode: string; ProductName: string; UnitPrice: string }[];
  initialMovements: Movement[];
}

function emptyLine(): DetailLine {
  return { productCode: "", qty: "", unitPrice: "" };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function MovementDocument({
  movementType,
  canSave,
  canApprove,
  canDelete,
  warehouses,
  suppliers,
  employees,
  products,
  initialMovements,
}: Props) {
  const [movements, setMovements] = useState(initialMovements);
  const [statusFilter, setStatusFilter] = useState<"DRAFT" | "CONFIRMED">("DRAFT");
  const [selected, setSelected] = useState<Movement | null>(null);
  const [warehouseCode, setWarehouseCode] = useState("");
  const [targetWarehouseCode, setTargetWarehouseCode] = useState("");
  const [supplierCode, setSupplierCode] = useState("");
  const [empCode, setEmpCode] = useState("");
  const [movementDate, setMovementDate] = useState(today());
  const [lines, setLines] = useState<DetailLine[]>([emptyLine()]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paidAmount, setPaidAmount] = useState("0");
  const [openDebts, setOpenDebts] = useState<Debt[]>([]);
  const [debtId, setDebtId] = useState("");

  async function refreshList(status: "DRAFT" | "CONFIRMED") {
    const res = await fetch(`/api/inventory/movements?type=${movementType}&status=${status}`);
    if (res.ok) setMovements(await res.json());
  }

  async function switchFilter(status: "DRAFT" | "CONFIRMED") {
    setStatusFilter(status);
    setSelected(null);
    await refreshList(status);
  }

  function resetForm() {
    setSelected(null);
    setWarehouseCode("");
    setTargetWarehouseCode("");
    setSupplierCode("");
    setEmpCode("");
    setMovementDate(today());
    setLines([emptyLine()]);
    setPaidAmount("0");
    setOpenDebts([]);
    setDebtId("");
    setMessage(null);
  }

  async function loadEmployeeDebts(code: string) {
    if (!code) {
      setOpenDebts([]);
      return;
    }
    const res = await fetch(`/api/inventory/employee-debts?empCode=${encodeURIComponent(code)}&status=OPEN`);
    if (res.ok) setOpenDebts(await res.json());
  }

  function selectMovement(m: Movement) {
    setSelected(m);
    setWarehouseCode(m.WarehouseCode);
    setTargetWarehouseCode(m.TargetWarehouseCode ?? "");
    setSupplierCode(m.SupplierCode ?? "");
    setEmpCode(m.EmpCode ?? "");
    setMovementDate(m.MovementDate.slice(0, 10));
    setLines(m.Details.length > 0 ? m.Details.map((d) => ({ productCode: d.ProductCode, qty: d.Qty, unitPrice: d.UnitPrice })) : [emptyLine()]);
    setPaidAmount("0");
    setDebtId("");
    setMessage(null);
    if (movementType === "RETURN" && m.EmpCode) void loadEmployeeDebts(m.EmpCode);
  }

  function updateLine(i: number, patch: Partial<DetailLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  function buildBody() {
    return {
      warehouseCode,
      targetWarehouseCode: movementType === "TRANSFER" ? targetWarehouseCode : undefined,
      supplierCode: movementType === "PURCHASE" ? supplierCode : undefined,
      empCode: movementType === "ISSUE" || movementType === "RETURN" ? empCode : undefined,
      movementDate,
      details: lines.filter((l) => l.productCode && l.qty).map((l) => ({ productCode: l.productCode, qty: Number(l.qty), unitPrice: Number(l.unitPrice || 0) })),
    };
  }

  async function handleSave() {
    setMessage(null);
    setBusy(true);
    try {
      const isNew = !selected;
      const url = isNew ? "/api/inventory/movements" : `/api/inventory/movements/${selected!.MovementID}`;
      const method = isNew ? "POST" : "PUT";
      const body = isNew ? { ...buildBody(), movementType } : buildBody();
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const resBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(resBody.message || resBody.error);
        return;
      }
      resetForm();
      await refreshList(statusFilter);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    setMessage(null);
    const res = await fetch(`/api/inventory/movements/${selected.MovementID}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    resetForm();
    await refreshList(statusFilter);
  }

  async function handleConfirm() {
    if (!selected) return;
    setMessage(null);
    setBusy(true);
    try {
      const confirmBody: Record<string, unknown> = {};
      if (movementType === "ISSUE") confirmBody.paidAmount = Number(paidAmount || 0);
      if (movementType === "RETURN" && debtId) confirmBody.debtId = Number(debtId);
      const res = await fetch(`/api/inventory/movements/${selected.MovementID}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmBody),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      resetForm();
      await refreshList(statusFilter);
    } finally {
      setBusy(false);
    }
  }

  const total = lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);
  const productMap = new Map(products.map((p) => [p.ProductCode, p]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 border-b border-gray-200">
        {(["DRAFT", "CONFIRMED"] as const).map((s) => (
          <button
            key={s}
            onClick={() => switchFilter(s)}
            className={`border-b-2 px-3 py-2 text-sm ${
              statusFilter === s ? "border-gray-900 font-medium text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {s === "DRAFT" ? "ร่าง (Draft)" : "ยืนยันแล้ว (Confirmed)"}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">เลขที่</th>
              <th className="px-3 py-2 font-medium">วันที่</th>
              <th className="px-3 py-2 font-medium">คลัง</th>
              <th className="px-3 py-2 font-medium">รายการ</th>
              <th className="px-3 py-2 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.MovementID} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => selectMovement(m)}>
                <td className="px-3 py-2">{m.MovementID}</td>
                <td className="px-3 py-2">{m.MovementDate.slice(0, 10)}</td>
                <td className="px-3 py-2">{m.WarehouseCode}</td>
                <td className="px-3 py-2">{m.Details.length} รายการ</td>
                <td className="px-3 py-2">{m.Status === "DRAFT" ? <span className="text-amber-600">ร่าง</span> : <span className="text-green-600">ยืนยันแล้ว</span>}</td>
              </tr>
            ))}
            {movements.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                  ยังไม่มีข้อมูล
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canSave && (
        <div className="flex justify-end">
          <button onClick={resetForm} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            + สร้างเอกสารใหม่
          </button>
        </div>
      )}

      {(canSave || selected) && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              วันที่
              <input
                type="date"
                value={movementDate}
                onChange={(e) => setMovementDate(e.target.value)}
                disabled={!!selected && selected.Status !== "DRAFT"}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              คลังสินค้า
              <select
                value={warehouseCode}
                onChange={(e) => setWarehouseCode(e.target.value)}
                disabled={!!selected && selected.Status !== "DRAFT"}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              >
                <option value="">-- เลือก --</option>
                {warehouses.map((w) => (
                  <option key={w.WarehouseCode} value={w.WarehouseCode}>
                    {w.WarehouseName}
                  </option>
                ))}
              </select>
            </label>
            {movementType === "TRANSFER" && (
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                คลังปลายทาง
                <select
                  value={targetWarehouseCode}
                  onChange={(e) => setTargetWarehouseCode(e.target.value)}
                  disabled={!!selected && selected.Status !== "DRAFT"}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value="">-- เลือก --</option>
                  {warehouses.map((w) => (
                    <option key={w.WarehouseCode} value={w.WarehouseCode}>
                      {w.WarehouseName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {movementType === "PURCHASE" && (
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                ผู้ขาย
                <select
                  value={supplierCode}
                  onChange={(e) => setSupplierCode(e.target.value)}
                  disabled={!!selected && selected.Status !== "DRAFT"}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value="">-- เลือก --</option>
                  {suppliers.map((s) => (
                    <option key={s.SupplierCode} value={s.SupplierCode}>
                      {s.SupplierName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(movementType === "ISSUE" || movementType === "RETURN") && (
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                พนักงาน
                <select
                  value={empCode}
                  onChange={(e) => {
                    setEmpCode(e.target.value);
                    if (movementType === "RETURN") void loadEmployeeDebts(e.target.value);
                  }}
                  disabled={!!selected && selected.Status !== "DRAFT"}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value="">-- เลือก --</option>
                  {employees.map((e) => (
                    <option key={e.EmpCode} value={e.EmpCode}>
                      {e.FullName} ({e.EmpCode})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <table className="mb-3 w-full border-collapse text-sm">
            <thead className="border-b border-gray-200 text-left text-gray-500">
              <tr>
                <th className="py-1 font-medium">สินค้า</th>
                <th className="py-1 font-medium">จำนวน{movementType === "ADJUST" ? " (+/-)" : ""}</th>
                <th className="py-1 font-medium">ราคา/หน่วย</th>
                <th className="py-1 font-medium">จำนวนเงิน</th>
                {(!selected || selected.Status === "DRAFT") && <th className="py-1"></th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1 pr-2">
                    {!selected || selected.Status === "DRAFT" ? (
                      <select
                        value={l.productCode}
                        onChange={(e) => {
                          const p = productMap.get(e.target.value);
                          updateLine(i, { productCode: e.target.value, unitPrice: p ? p.UnitPrice : l.unitPrice });
                        }}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      >
                        <option value="">-- เลือกสินค้า --</option>
                        {products.map((p) => (
                          <option key={p.ProductCode} value={p.ProductCode}>
                            {p.ProductName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      productMap.get(l.productCode)?.ProductName ?? l.productCode
                    )}
                  </td>
                  <td className="py-1 pr-2">
                    {!selected || selected.Status === "DRAFT" ? (
                      <input
                        value={l.qty}
                        onChange={(e) => updateLine(i, { qty: e.target.value })}
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      l.qty
                    )}
                  </td>
                  <td className="py-1 pr-2">
                    {!selected || selected.Status === "DRAFT" ? (
                      <input
                        value={l.unitPrice}
                        onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      l.unitPrice
                    )}
                  </td>
                  <td className="py-1 pr-2">{((Number(l.qty) || 0) * (Number(l.unitPrice) || 0)).toFixed(2)}</td>
                  {(!selected || selected.Status === "DRAFT") && (
                    <td className="py-1">
                      <button onClick={() => removeLine(i)} className="text-red-500 hover:underline">
                        ลบ
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {(!selected || selected.Status === "DRAFT") && (
            <button onClick={addLine} className="mb-3 text-sm text-gray-600 hover:underline">
              + เพิ่มรายการ
            </button>
          )}

          <p className="mb-3 text-sm font-medium text-gray-900">รวมทั้งสิ้น: {total.toFixed(2)} บาท</p>

          {movementType === "ISSUE" && selected?.Status === "DRAFT" && canApprove && (
            <label className="mb-3 flex flex-col gap-1 text-xs text-gray-500">
              ชำระทันที (บาท) — ส่วนที่เหลือจะตั้งเป็นหนี้พนักงานอัตโนมัติ
              <input value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className="w-40 rounded border border-gray-300 px-2 py-1 text-sm" />
            </label>
          )}

          {movementType === "RETURN" && selected?.Status === "DRAFT" && canApprove && (
            <label className="mb-3 flex flex-col gap-1 text-xs text-gray-500">
              นำไปหักหนี้รายการ (ถ้ามี)
              <select value={debtId} onChange={(e) => setDebtId(e.target.value)} className="w-72 rounded border border-gray-300 px-2 py-1 text-sm">
                <option value="">-- ไม่หักหนี้ --</option>
                {openDebts.map((d) => (
                  <option key={d.DebtID} value={d.DebtID}>
                    หนี้ #{d.DebtID} — คงเหลือ {d.RemainingAmount} บาท
                  </option>
                ))}
              </select>
            </label>
          )}

          {message && <p className="mb-3 text-sm text-red-600">{message}</p>}

          <div className="flex gap-2">
            {(!selected || selected.Status === "DRAFT") && canSave && (
              <button onClick={handleSave} disabled={busy} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
                บันทึก
              </button>
            )}
            {selected && selected.Status === "DRAFT" && canApprove && (
              <button onClick={handleConfirm} disabled={busy} className="rounded-md bg-green-700 px-3 py-1.5 text-sm text-white hover:bg-green-800 disabled:opacity-50">
                ยืนยัน (Confirm)
              </button>
            )}
            {selected && selected.Status === "DRAFT" && canDelete && (
              <button onClick={handleDelete} className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
                ลบ
              </button>
            )}
            {selected && (
              <button onClick={resetForm} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                ยกเลิก
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
