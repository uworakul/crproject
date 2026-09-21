"use client";

import { useState } from "react";
import Swal from "sweetalert2";
import { toBuddhistYear } from "@/lib/buddhist-year";
import SearchableSelect from "../../searchable-select";

interface DetailRow {
  DetailID: number;
  LineType: "INCOME" | "DEDUCTION";
  Code: string;
  Description: string;
  Hours: string | null;
  Days: string | null;
  Amount: string;
}

interface Transaction {
  TransactionID: number;
  WorkDays: string;
  GrossWage: string;
  OtherIncome: string;
  OtherDeduction: string;
  NetPay: string;
  Details: DetailRow[];
}

interface PeriodInfo {
  PeriodID: number;
  PeriodYear: number;
  PeriodMonth: number;
  StartDate: string;
  EndDate: string;
}

async function confirmDeleteLine(name: string): Promise<boolean> {
  const result = await Swal.fire({
    html: `ยืนยันการลบ "${name}"?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

const emptyForm = { lineType: "INCOME" as "INCOME" | "DEDUCTION", code: "", hours: "", days: "", amount: "" };

// Expandable-row content for a single employee's transaction — receives its
// initial period+transaction as props (fetched by the parent's row-click
// handler, same "own slice, refresh() after mutation" convention as
// LeaveTenureTierPanel/SitePositionIncomePanel — no fetch-on-mount here).
export default function TransactionDetailPanel({
  empCode,
  initialPeriod,
  initialTransaction,
  incomeTypes,
  deductionTypes,
  canSave,
}: {
  empCode: string;
  initialPeriod: PeriodInfo;
  initialTransaction: Transaction;
  incomeTypes: { IncomeCode: string; IncomeName: string }[];
  deductionTypes: { DeductionCode: string; DeductionName: string }[];
  canSave: boolean;
}) {
  const [period, setPeriod] = useState(initialPeriod);
  const [transaction, setTransaction] = useState(initialTransaction);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ hours: "", days: "", amount: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`/api/payroll/transactions/by-employee?empCode=${encodeURIComponent(empCode)}`);
    if (res.ok) {
      const body = await res.json();
      setPeriod(body.period);
      setTransaction(body.transaction);
    }
  }

  const usedCodes = new Set(transaction.Details.filter((d) => d.LineType === form.lineType).map((d) => d.Code));
  const typeOptions = (form.lineType === "INCOME" ? incomeTypes : deductionTypes)
    .filter((t) => !usedCodes.has("IncomeCode" in t ? t.IncomeCode : t.DeductionCode))
    .map((t) => ("IncomeCode" in t ? { code: t.IncomeCode, label: t.IncomeName } : { code: t.DeductionCode, label: t.DeductionName }));

  async function handleAdd() {
    if (!form.code) return;
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/payroll/transaction-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: transaction.TransactionID,
          lineType: form.lineType,
          code: form.code,
          hours: form.hours || undefined,
          days: form.days || undefined,
          amount: Number(form.amount),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      setForm({ ...emptyForm, lineType: form.lineType });
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  function startEdit(d: DetailRow) {
    setEditingId(d.DetailID);
    setEditForm({ hours: d.Hours ?? "", days: d.Days ?? "", amount: d.Amount });
  }

  async function saveEdit(id: number) {
    setMessage(null);
    const res = await fetch(`/api/payroll/transaction-details/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours: editForm.hours || null, days: editForm.days || null, amount: Number(editForm.amount) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    setEditingId(null);
    await refresh();
  }

  async function remove(d: DetailRow) {
    if (!(await confirmDeleteLine(d.Description))) return;
    setMessage(null);
    const res = await fetch(`/api/payroll/transaction-details/${d.DetailID}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    await refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-gray-200 bg-gray-50 p-3">
      <div className="grid grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-gray-500">งวดปัจจุบัน</div>
          <div className="font-medium">
            {period.PeriodMonth}/{toBuddhistYear(period.PeriodYear)}
          </div>
        </div>
        <div>
          <div className="text-gray-500">ช่วงวันที่</div>
          <div>
            {new Date(period.StartDate).toLocaleDateString("th-TH")} - {new Date(period.EndDate).toLocaleDateString("th-TH")}
          </div>
        </div>
        <div>
          <div className="text-gray-500">จำนวนวันทำงาน (จาก Worksheet)</div>
          <div>{transaction.WorkDays}</div>
        </div>
        <div>
          <div className="text-gray-500">รายได้พื้นฐาน (GrossWage)</div>
          <div>{Number(transaction.GrossWage).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">ประเภท</th>
              <th className="px-3 py-2 font-medium">รายการ</th>
              <th className="px-3 py-2 font-medium text-right">ชม.</th>
              <th className="px-3 py-2 font-medium text-right">วัน</th>
              <th className="px-3 py-2 font-medium text-right">จำนวนเงิน</th>
              {canSave && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {transaction.Details.map((d) => {
              const isEditing = editingId === d.DetailID;
              return (
                <tr key={d.DetailID} className="border-t border-gray-100 hover:bg-purple-50">
                  <td className="px-3 py-2">{d.LineType === "INCOME" ? "รายได้" : "รายการหัก"}</td>
                  <td className="px-3 py-2">{d.Description}</td>
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <input type="number" step="any" value={editForm.hours} onChange={(e) => setEditForm({ ...editForm, hours: e.target.value })} className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm" />
                    ) : (
                      (d.Hours ?? "-")
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <input type="number" step="any" value={editForm.days} onChange={(e) => setEditForm({ ...editForm, days: e.target.value })} className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm" />
                    ) : (
                      (d.Days ?? "-")
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <input type="number" step="any" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm" />
                    ) : (
                      Number(d.Amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })
                    )}
                  </td>
                  {canSave && (
                    <td className="px-3 py-2 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => saveEdit(d.DetailID)} className="text-gray-900 hover:underline">
                            บันทึก
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-gray-400 hover:underline">
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => startEdit(d)} className="text-gray-500 hover:underline">
                            แก้ไข
                          </button>
                          <button onClick={() => remove(d)} className="text-red-500 hover:underline">
                            ลบ
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {transaction.Details.length === 0 && (
              <tr>
                <td colSpan={canSave ? 6 : 5} className="px-3 py-6 text-center text-gray-400">
                  ยังไม่มีรายการ
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t border-gray-200 bg-gray-50 font-medium">
            <tr>
              <td colSpan={4} className="px-3 py-2 text-right text-gray-500">
                รวมรายได้อื่น / รวมรายการหักอื่น
              </td>
              <td className="px-3 py-2 text-right">
                +{Number(transaction.OtherIncome).toLocaleString("th-TH", { minimumFractionDigits: 2 })} / -
                {Number(transaction.OtherDeduction).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </td>
              {canSave && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>

      {canSave && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 bg-white p-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            ประเภท
            <select
              value={form.lineType}
              onChange={(e) => setForm({ ...emptyForm, lineType: e.target.value as "INCOME" | "DEDUCTION" })}
              className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            >
              <option value="INCOME">รายได้</option>
              <option value="DEDUCTION">รายการหัก</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            รายการ
            <div className="w-72">
              <SearchableSelect value={form.code} onChange={(code) => setForm({ ...form, code })} options={typeOptions} placeholder="เลือกรายการ" />
            </div>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            จำนวนชม.
            <input type="number" step="any" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            จำนวนวัน
            <input type="number" step="any" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            จำนวนเงิน
            <input type="number" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-28 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900" />
          </label>
          <button onClick={handleAdd} disabled={loading || !form.code || !form.amount} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
            + เพิ่มรายการ
          </button>
        </div>
      )}
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
