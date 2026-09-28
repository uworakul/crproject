"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Swal from "sweetalert2";
import SearchableSelect from "../../searchable-select";
import { REQUEST_DOCUMENT_KIND, type RequestDocumentCode } from "@/lib/request";

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
  OldPositionCode: string | null;
  NewPositionCode: string | null;
  OldIncome: string | null;
  ResignReason: string | null;
  RequestedResignDate: string | null;
  BlacklistCode: string | null;
  ReferrerName: string | null;
  Employee: { FullName: string; EmployeeStatus: string; StartDate: string; EmployeeType: string };
  OldPosition: { PositionName: string } | null;
  NewPosition: { PositionName: string } | null;
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

interface CommissionCandidate {
  EmpCode: string;
  FullName: string;
  StartDate: string;
  EmployeeStatus: string;
  ReferrerEmpCode: string | null;
  Site: { SiteName: string } | null;
}

interface EmployeeOption {
  EmpCode: string;
  FullName: string;
  PositionCode: string | null;
  Position: { PositionName: string } | null;
  EmployeeType: string;
  DailyRate: string | null;
  MonthlySalary: string | null;
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

function incomeUnitLabel(employeeType: string) {
  return employeeType === "MONTHLY" ? "บาท/เดือน" : "บาท/วัน";
}

// Calendar days since StartDate, shown in days (not years/months) since
// that's the same unit COMMISSION_MIN_DAYS (120) itself is measured in —
// lets HR see eligibility for this feature at a glance without doing date
// math themselves.
function tenureLabel(startDate: string) {
  const days = Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000);
  return `${days.toLocaleString("th-TH")} วัน`;
}

export default function RequestDetailView({
  request,
  canSave,
  canApprove,
  employees,
  positions,
  blacklist,
}: {
  request: RequestDoc;
  canSave: boolean;
  canApprove: boolean;
  employees: EmployeeOption[];
  positions: { PositionCode: string; PositionName: string }[];
  blacklist: { IDCardNo: string; FullName: string }[];
}) {
  const router = useRouter();
  const documentCode = request.DocumentCode as RequestDocumentCode;
  const kind = REQUEST_DOCUMENT_KIND[documentCode];
  const [remark, setRemark] = useState(request.Remark ?? "");
  const [newRow, setNewRow] = useState({
    empCode: "",
    amount: "",
    deductPerPeriod: "",
    newPositionCode: "",
    resignReason: "",
    requestedResignDate: "",
    blacklistCode: "",
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ amount: "", deductPerPeriod: "", newPositionCode: "", resignReason: "", requestedResignDate: "", blacklistCode: "" });
  const [rejectReason, setRejectReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  // COMMISSION "Load" candidates (2026-09-28) — null = not searched yet,
  // [] = searched, nobody eligible right now. Amounts are kept in a
  // separate map (not on the candidate itself) so filling one in doesn't
  // require rebuilding the whole array.
  const [candidates, setCandidates] = useState<CommissionCandidate[] | null>(null);
  const [candidateAmounts, setCandidateAmounts] = useState<Record<string, string>>({});
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [addingCandidate, setAddingCandidate] = useState<string | null>(null);
  // Default amount (2026-09-28) — typed once before clicking Load, applied
  // to every row that comes back so HR doesn't have to type the same
  // commission amount per person; each row's own input still overrides it.
  const [defaultAmount, setDefaultAmount] = useState("");

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

  const selectedEmployee = employees.find((e) => e.EmpCode === newRow.empCode);

  function canSubmitNewRow(): boolean {
    if (!newRow.empCode.trim()) return false;
    if (kind === "DEBT" || kind === "INCOME") return !!newRow.amount;
    if (kind === "POSITION_CHANGE") return !!newRow.newPositionCode;
    return !!newRow.resignReason.trim() && !!newRow.requestedResignDate;
  }

  async function addRow() {
    if (!canSubmitNewRow()) return;
    const existingIndex = request.Details.findIndex((d) => d.EmpCode === newRow.empCode);
    if (existingIndex !== -1) {
      setMessage(`มีรายการนี้แล้ว ในลำดับที่ ${existingIndex + 1}`);
      return;
    }
    let body: Record<string, unknown>;
    if (kind === "DEBT" || kind === "INCOME") {
      body = { empCode: newRow.empCode, amount: newRow.amount, deductPerPeriod: newRow.deductPerPeriod || "0" };
    } else if (kind === "POSITION_CHANGE") {
      body = { empCode: newRow.empCode, newPositionCode: newRow.newPositionCode };
    } else {
      body = { empCode: newRow.empCode, resignReason: newRow.resignReason, requestedResignDate: newRow.requestedResignDate, blacklistCode: newRow.blacklistCode || null };
    }
    const ok = await call("/details", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (ok) setNewRow({ empCode: "", amount: "", deductPerPeriod: "", newPositionCode: "", resignReason: "", requestedResignDate: "", blacklistCode: "" });
  }

  // "Load" button (2026-09-28) — pre-searches employees eligible for a
  // COMMISSION claim right now (has a referrer, hasn't claimed before,
  // >=120 days since StartDate, not resigned before today) so HR doesn't
  // have to check each candidate one by one via the plain empCode search
  // above. This is a convenience pre-filter only — approve/route.ts is
  // still the authoritative eligibility check regardless of what's shown
  // here.
  async function loadCandidates() {
    setMessage(null);
    setCandidatesLoading(true);
    try {
      const res = await fetch(`/api/requests/${request.RequestHeaderID}/commission-candidates`);
      const body = await res.json().catch(() => ([]));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      const rows = body as CommissionCandidate[];
      setCandidates(rows);
      // Pre-fill every row with the default amount (if one was entered) —
      // still a per-row editable input afterward, this is just the starting
      // value.
      setCandidateAmounts(defaultAmount ? Object.fromEntries(rows.map((c) => [c.EmpCode, defaultAmount])) : {});
    } finally {
      setCandidatesLoading(false);
    }
  }

  async function addCandidate(c: CommissionCandidate) {
    const amount = candidateAmounts[c.EmpCode];
    if (!amount || Number(amount) <= 0) return;
    setAddingCandidate(c.EmpCode);
    try {
      const ok = await call("/details", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empCode: c.EmpCode, amount }) });
      if (ok) setCandidates((prev) => (prev ? prev.filter((x) => x.EmpCode !== c.EmpCode) : prev));
    } finally {
      setAddingCandidate(null);
    }
  }

  function startEdit(d: DetailRow) {
    setEditingId(d.RequestDetailID);
    setEditForm({
      amount: d.Amount,
      deductPerPeriod: d.DeductPerPeriod,
      newPositionCode: d.NewPositionCode ?? "",
      resignReason: d.ResignReason ?? "",
      requestedResignDate: d.RequestedResignDate ? d.RequestedResignDate.slice(0, 10) : "",
      blacklistCode: d.BlacklistCode ?? "",
    });
  }

  async function saveEdit(detailId: number) {
    let body: Record<string, unknown>;
    if (kind === "DEBT" || kind === "INCOME") body = { amount: editForm.amount, deductPerPeriod: editForm.deductPerPeriod };
    else if (kind === "POSITION_CHANGE") body = { newPositionCode: editForm.newPositionCode };
    else body = { resignReason: editForm.resignReason, requestedResignDate: editForm.requestedResignDate, blacklistCode: editForm.blacklistCode || null };
    const ok = await call(`/details/${detailId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (ok) setEditingId(null);
  }

  async function deleteRow(d: DetailRow) {
    if (!(await confirmDialog(`ยืนยันลบรายการของ ${d.EmpCode} — ${d.Employee.FullName}?`))) return;
    await call(`/details/${d.RequestDetailID}`, { method: "DELETE" });
  }

  const canEditRows = canSave && request.Status !== "APPROVED";
  const isMoneyKind = kind === "DEBT" || kind === "INCOME";
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
              <th className="px-3 py-2 font-medium">{documentCode === "COMMISSION" ? "รหัสพนักงานใหม่ (ผู้ถูกแนะนำ)" : "รหัสพนักงาน"}</th>
              <th className="px-3 py-2 font-medium">ชื่อพนักงาน</th>
              <th className="px-3 py-2 font-medium">สถานะพนักงาน</th>
              <th className="px-3 py-2 font-medium">วันเริ่มงาน</th>
              <th className="px-3 py-2 font-medium text-right">อายุงาน</th>
              {documentCode === "COMMISSION" && <th className="px-3 py-2 font-medium">ผู้รับเงิน (ผู้แนะนำ)</th>}
              {isMoneyKind && <th className="px-3 py-2 font-medium text-right">ยอดเงิน</th>}
              {kind === "DEBT" && <th className="px-3 py-2 font-medium text-right">หักงวดละ</th>}
              {kind === "POSITION_CHANGE" && (
                <>
                  <th className="px-3 py-2 font-medium">ตำแหน่งเดิม</th>
                  <th className="px-3 py-2 font-medium text-right">รายได้เดิม</th>
                  <th className="px-3 py-2 font-medium">ตำแหน่งใหม่</th>
                </>
              )}
              {kind === "RESIGN" && (
                <>
                  <th className="px-3 py-2 font-medium">เหตุผล</th>
                  <th className="px-3 py-2 font-medium">วันที่ขอลาออก</th>
                  <th className="px-3 py-2 font-medium">รหัสแบล็คลิส</th>
                </>
              )}
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
                  <td className="px-3 py-2 text-right text-gray-500">{tenureLabel(d.Employee.StartDate)}</td>
                  {documentCode === "COMMISSION" && <td className="px-3 py-2">{d.ReferrerName ?? "-"}</td>}
                  {isMoneyKind && (
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
                  )}
                  {kind === "DEBT" && (
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
                  )}
                  {kind === "POSITION_CHANGE" && (
                    <>
                      <td className="px-3 py-2 text-gray-500">{d.OldPosition?.PositionName ?? "-"}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{d.OldIncome !== null ? `${money(d.OldIncome)} ${incomeUnitLabel(d.Employee.EmployeeType)}` : "-"}</td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <select
                            value={editForm.newPositionCode}
                            onChange={(e) => setEditForm({ ...editForm, newPositionCode: e.target.value })}
                            className="rounded border border-gray-300 px-2 py-1 text-sm"
                          >
                            {positions.map((p) => (
                              <option key={p.PositionCode} value={p.PositionCode}>
                                {p.PositionName}
                              </option>
                            ))}
                          </select>
                        ) : (
                          (d.NewPosition?.PositionName ?? "-")
                        )}
                      </td>
                    </>
                  )}
                  {kind === "RESIGN" && (
                    <>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <input
                            value={editForm.resignReason}
                            onChange={(e) => setEditForm({ ...editForm, resignReason: e.target.value })}
                            className="w-40 rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                        ) : (
                          (d.ResignReason ?? "-")
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <input
                            type="date"
                            value={editForm.requestedResignDate}
                            onChange={(e) => setEditForm({ ...editForm, requestedResignDate: e.target.value })}
                            className="rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                        ) : d.RequestedResignDate ? (
                          new Date(d.RequestedResignDate).toLocaleDateString("th-TH")
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <select
                            value={editForm.blacklistCode}
                            onChange={(e) => setEditForm({ ...editForm, blacklistCode: e.target.value })}
                            className="rounded border border-gray-300 px-2 py-1 text-sm"
                          >
                            <option value="">- ไม่ระบุ -</option>
                            {blacklist.map((b) => (
                              <option key={b.IDCardNo} value={b.IDCardNo}>
                                {b.IDCardNo} — {b.FullName}
                              </option>
                            ))}
                          </select>
                        ) : d.BlacklistCode ? (
                          `${d.BlacklistCode} — ${blacklist.find((b) => b.IDCardNo === d.BlacklistCode)?.FullName ?? "-"}`
                        ) : (
                          "-"
                        )}
                      </td>
                    </>
                  )}
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
                <td colSpan={99} className="px-3 py-6 text-center text-gray-400">
                  ยังไม่มีรายการพนักงาน
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEditRows && documentCode === "COMMISSION" && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-gray-300 p-3">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              ยอดเงิน (ค่าเริ่มต้น)
              <input
                type="number"
                step="0.01"
                value={defaultAmount}
                onChange={(e) => setDefaultAmount(e.target.value)}
                placeholder="ใส่ก่อน Load"
                className="w-28 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
              />
            </label>
            <button
              onClick={loadCandidates}
              disabled={candidatesLoading}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {candidatesLoading ? "กำลังค้นหา..." : "Load"}
            </button>
            <span className="text-xs text-gray-500">ค้นหาพนักงานที่ผ่านงาน 120 วัน ยังไม่ลาออก มีรหัสคนแนะนำ และยังไม่เคยเบิกค่านำพา</span>
            {candidates !== null && (
              <button onClick={() => setCandidates(null)} className="ml-auto text-xs text-gray-400 hover:underline">
                ✕ ปิดรายการที่ค้นหา
              </button>
            )}
          </div>
          {candidates !== null &&
            (candidates.length === 0 ? (
              <p className="text-sm text-gray-400">ไม่พบพนักงานที่เข้าเงื่อนไข</p>
            ) : (
              <div className="overflow-x-auto rounded border border-gray-200 bg-white">
                <table className="w-full border-collapse text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">รหัสพนักงาน</th>
                      <th className="px-3 py-2 font-medium">ชื่อ</th>
                      <th className="px-3 py-2 font-medium">หน่วยงานหลัก</th>
                      <th className="px-3 py-2 font-medium">วันเริ่มงาน</th>
                      <th className="px-3 py-2 font-medium text-right">อายุงาน</th>
                      <th className="px-3 py-2 font-medium">สถานะ</th>
                      <th className="px-3 py-2 font-medium">รหัสผู้แนะนำ</th>
                      <th className="px-3 py-2 font-medium text-right">ยอดเงิน</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c) => (
                      <tr key={c.EmpCode} className="border-t border-gray-100">
                        <td className="px-3 py-2">{c.EmpCode}</td>
                        <td className="px-3 py-2">{c.FullName}</td>
                        <td className="px-3 py-2 text-gray-500">{c.Site?.SiteName ?? "-"}</td>
                        <td className="px-3 py-2 text-gray-500">{new Date(c.StartDate).toLocaleDateString("th-TH")}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{tenureLabel(c.StartDate)}</td>
                        <td className="px-3 py-2 text-gray-500">{EMP_STATUS_LABEL[c.EmployeeStatus] ?? c.EmployeeStatus}</td>
                        <td className="px-3 py-2 text-gray-500">{c.ReferrerEmpCode ?? "-"}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={candidateAmounts[c.EmpCode] ?? ""}
                            onChange={(e) => setCandidateAmounts({ ...candidateAmounts, [c.EmpCode]: e.target.value })}
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <button
                            onClick={() => addCandidate(c)}
                            disabled={!candidateAmounts[c.EmpCode] || Number(candidateAmounts[c.EmpCode]) <= 0 || addingCandidate === c.EmpCode}
                            className="rounded-md bg-gray-900 px-2.5 py-1 text-xs text-white hover:bg-gray-700 disabled:opacity-50"
                          >
                            {addingCandidate === c.EmpCode ? "กำลังเพิ่ม..." : "+ เพิ่ม"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </div>
      )}

      {canEditRows && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 p-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            {documentCode === "COMMISSION" ? "รหัสพนักงานใหม่ (ผู้ถูกแนะนำ)" : "รหัสพนักงาน"}
            <div className="w-56">
              <SearchableSelect
                value={newRow.empCode}
                onChange={(code) => setNewRow({ ...newRow, empCode: code })}
                options={employees.map((e) => ({ code: e.EmpCode, label: `${e.EmpCode} — ${e.FullName}` }))}
                placeholder="ค้นหารหัส/ชื่อพนักงาน"
              />
            </div>
          </label>

          {isMoneyKind && (
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              ยอดเงิน
              <input
                type="number"
                step="0.01"
                value={newRow.amount}
                onChange={(e) =>
                  setNewRow({ ...newRow, amount: e.target.value, deductPerPeriod: kind === "DEBT" ? e.target.value : newRow.deductPerPeriod })
                }
                className="w-28 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
              />
            </label>
          )}
          {kind === "DEBT" && (
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
          )}

          {kind === "POSITION_CHANGE" && (
            <>
              {selectedEmployee && (
                <div className="text-xs text-gray-500">
                  ตำแหน่งปัจจุบัน: <span className="text-gray-800">{selectedEmployee.Position?.PositionName ?? "-"}</span> · รายได้ปัจจุบัน:{" "}
                  <span className="text-gray-800">
                    {(selectedEmployee.EmployeeType === "MONTHLY" ? selectedEmployee.MonthlySalary : selectedEmployee.DailyRate) !== null
                      ? `${money((selectedEmployee.EmployeeType === "MONTHLY" ? selectedEmployee.MonthlySalary : selectedEmployee.DailyRate)!)} ${incomeUnitLabel(selectedEmployee.EmployeeType)}`
                      : "-"}
                  </span>
                </div>
              )}
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                ตำแหน่งใหม่
                <select
                  value={newRow.newPositionCode}
                  onChange={(e) => setNewRow({ ...newRow, newPositionCode: e.target.value })}
                  className="w-48 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                >
                  <option value="">- เลือกตำแหน่ง -</option>
                  {positions
                    .filter((p) => !selectedEmployee || p.PositionCode !== selectedEmployee.PositionCode)
                    .map((p) => (
                      <option key={p.PositionCode} value={p.PositionCode}>
                        {p.PositionName}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}

          {kind === "RESIGN" && (
            <>
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                เหตุผล
                <input
                  value={newRow.resignReason}
                  onChange={(e) => setNewRow({ ...newRow, resignReason: e.target.value })}
                  className="w-48 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                วันที่ขอลาออก
                <input
                  type="date"
                  value={newRow.requestedResignDate}
                  onChange={(e) => setNewRow({ ...newRow, requestedResignDate: e.target.value })}
                  className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                รหัสแบล็คลิส
                <select
                  value={newRow.blacklistCode}
                  onChange={(e) => setNewRow({ ...newRow, blacklistCode: e.target.value })}
                  className="w-48 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                >
                  <option value="">- ไม่ระบุ -</option>
                  {blacklist.map((b) => (
                    <option key={b.IDCardNo} value={b.IDCardNo}>
                      {b.IDCardNo} — {b.FullName}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <button
            onClick={addRow}
            disabled={!canSubmitNewRow() || request.Details.some((d) => d.EmpCode === newRow.empCode)}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            + เพิ่มรายการ
          </button>
        </div>
      )}

      <div className="flex items-center justify-between rounded bg-gray-50 p-3 text-sm">
        <span>จำนวนรายการทั้งหมด {request.Details.length} รายการ</span>
        {isMoneyKind && <span className="font-semibold">ยอดเงินรวม {money(totalAmount)} บาท</span>}
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
                const summary = isMoneyKind ? `ยอดรวม ${money(totalAmount)} บาท` : `${request.Details.length} รายการ`;
                if (!(await confirmDialog(`ยืนยันอนุมัติเอกสาร ${request.DocumentCode} ${request.DocumentNo ? `#${request.DocumentNo}` : ""} จำนวน ${request.Details.length} รายการ (${summary})?`)))
                  return;
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
