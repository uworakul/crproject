"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Swal from "sweetalert2";
import SearchableSelect from "../../searchable-select";

async function confirmDialog(html: string) {
  const result = await Swal.fire({
    html,
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
  RequestDetailID: number;
  EmpCode: string;
  Amount: string;
  DeductPerPeriod: string;
  Employee: { FullName: string; EmployeeStatus: string; StartDate: string };
}

interface RequestDoc {
  RequestHeaderID: number;
  DocumentCode: string;
  DocumentNo: string | null;
  RequestDate: string;
  Remark: string | null;
  Status: string;
  RejectReason: string | null;
  Details: DetailRow[];
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "แบบร่าง",
  SUBMITTED: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
};

const EMP_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "ปกติ",
  PROBATION: "ทดลองงาน",
  SUSPENDED: "พักงาน",
  TERMINATED: "เลิกจ้าง",
  RESIGNED: "ลาออก",
};

function money(v: string | number) {
  return Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default function RequestDetailView({
  request,
  canSave,
  canApprove,
  employees,
}: {
  request: RequestDoc;
  canSave: boolean;
  canApprove: boolean;
  employees: { EmpCode: string; FullName: string }[];
}) {
  const router = useRouter();
  const [remark, setRemark] = useState(request.Remark ?? "");
  const [newRow, setNewRow] = useState({ empCode: "", amount: "", deductPerPeriod: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ amount: "", deductPerPeriod: "" });
  const [rejectReason, setRejectReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function call(path: string, opts?: RequestInit) {
    setMessage(null);
    const res = await fetch(`/api/requests/${request.RequestHeaderID}${path}`, opts);
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
    if (!newRow.empCode.trim() || !newRow.amount) return;
    const existingIndex = request.Details.findIndex((d) => d.EmpCode === newRow.empCode);
    if (existingIndex !== -1) {
      setMessage(`มีรายการนี้แล้ว ในลำดับที่ ${existingIndex + 1}`);
      return;
    }
    const ok = await call("/details", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newRow) });
    if (ok) setNewRow({ empCode: "", amount: "", deductPerPeriod: "" });
  }

  function startEdit(d: DetailRow) {
    setEditingId(d.RequestDetailID);
    setEditForm({ amount: d.Amount, deductPerPeriod: d.DeductPerPeriod });
  }

  async function saveEdit(detailId: number) {
    const ok = await call(`/details/${detailId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (ok) setEditingId(null);
  }

  async function deleteRow(d: DetailRow) {
    if (!(await confirmDialog(`ยืนยันลบรายการของ ${d.EmpCode} — ${d.Employee.FullName}?`))) return;
    await call(`/details/${d.RequestDetailID}`, { method: "DELETE" });
  }

  const canEditRows = canSave && request.Status !== "APPROVED";
  const totalAmount = request.Details.reduce((sum, d) => sum + Number(d.Amount), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-gray-500">รหัสเอกสาร</div>
          <div>{request.DocumentCode}</div>
        </div>
        <div>
          <div className="text-gray-500">เลขที่เอกสาร</div>
          <div>{request.DocumentNo ?? "-"}</div>
        </div>
        <div>
          <div className="text-gray-500">วันที่</div>
          <div>{new Date(request.RequestDate).toLocaleDateString("th-TH")}</div>
        </div>
        <div>
          <div className="text-gray-500">สถานะ</div>
          <div>{STATUS_LABEL[request.Status] ?? request.Status}</div>
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

      {request.RejectReason && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">ถูกไม่อนุมัติ: {request.RejectReason}</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">ลำดับที่</th>
              <th className="px-3 py-2 font-medium">รหัสพนักงาน</th>
              <th className="px-3 py-2 font-medium">ชื่อพนักงาน</th>
              <th className="px-3 py-2 font-medium">สถานะพนักงาน</th>
              <th className="px-3 py-2 font-medium">วันเริ่มงาน</th>
              <th className="px-3 py-2 font-medium text-right">ยอดเงิน</th>
              <th className="px-3 py-2 font-medium text-right">หักงวดละ</th>
              {canEditRows && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {request.Details.map((d, i) => {
              const isEditing = editingId === d.RequestDetailID;
              return (
                <tr key={d.RequestDetailID} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                  <td className="px-3 py-2">{d.EmpCode}</td>
                  <td className="px-3 py-2">{d.Employee.FullName}</td>
                  <td className="px-3 py-2 text-gray-500">{EMP_STATUS_LABEL[d.Employee.EmployeeStatus] ?? d.Employee.EmployeeStatus}</td>
                  <td className="px-3 py-2 text-gray-500">{new Date(d.Employee.StartDate).toLocaleDateString("th-TH")}</td>
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.amount}
                        onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                      />
                    ) : (
                      money(d.Amount)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.deductPerPeriod}
                        onChange={(e) => setEditForm({ ...editForm, deductPerPeriod: e.target.value })}
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                      />
                    ) : (
                      money(d.DeductPerPeriod)
                    )}
                  </td>
                  {canEditRows && (
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => saveEdit(d.RequestDetailID)} className="text-gray-900 hover:underline">
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
            {request.Details.length === 0 && (
              <tr>
                <td colSpan={canEditRows ? 8 : 7} className="px-3 py-6 text-center text-gray-400">
                  ยังไม่มีรายการพนักงาน
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEditRows && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 p-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            รหัสพนักงาน
            <div className="w-56">
              <SearchableSelect
                value={newRow.empCode}
                onChange={(code) => setNewRow({ ...newRow, empCode: code })}
                options={employees.map((e) => ({ code: e.EmpCode, label: `${e.EmpCode} — ${e.FullName}` }))}
                placeholder="ค้นหารหัส/ชื่อพนักงาน"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            ยอดเงิน
            <input
              type="number"
              step="0.01"
              value={newRow.amount}
              onChange={(e) => setNewRow({ ...newRow, amount: e.target.value, deductPerPeriod: e.target.value })}
              className="w-28 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            หักงวดละ
            <input
              type="number"
              step="0.01"
              value={newRow.deductPerPeriod}
              onChange={(e) => setNewRow({ ...newRow, deductPerPeriod: e.target.value })}
              className="w-28 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <button
            onClick={addRow}
            disabled={request.Details.some((d) => d.EmpCode === newRow.empCode)}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            + เพิ่มรายการ
          </button>
        </div>
      )}

      <div className="flex items-center justify-between rounded bg-gray-50 p-3 text-sm">
        <span>จำนวนรายการทั้งหมด {request.Details.length} รายการ</span>
        <span className="font-semibold">ยอดเงินรวม {money(totalAmount)} บาท</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {request.Status === "DRAFT" && canSave && (
          <button onClick={() => call("/submit", { method: "POST" })} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
            ส่งอนุมัติ
          </button>
        )}
        {request.Status === "SUBMITTED" && canApprove && (
          <>
            <button
              onClick={async () => {
                if (!(await confirmDialog(`ยืนยันอนุมัติเอกสาร ${request.DocumentCode} ${request.DocumentNo ? `#${request.DocumentNo}` : ""} จำนวน ${request.Details.length} รายการ ยอดรวม ${money(totalAmount)} บาท?`))) return;
                await call("/approve", { method: "POST" });
              }}
              className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
            >
              อนุมัติ
            </button>
            <div className="flex items-center gap-2">
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="เหตุผลที่ไม่อนุมัติ"
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <button
                onClick={() => call("/reject", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: rejectReason }) })}
                className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                ไม่อนุมัติ
              </button>
            </div>
          </>
        )}
        {request.Status === "APPROVED" && <p className="text-sm text-gray-500">อนุมัติแล้ว ไม่สามารถแก้ไขได้</p>}
      </div>

      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
