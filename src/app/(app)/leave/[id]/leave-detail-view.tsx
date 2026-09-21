"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Swal from "sweetalert2";
import { LEAVE_STATUS_LABELS, leaveIsAwaitingResubmit, LEAVE_HOURS_PER_DAY } from "@/lib/leave";

async function confirmApprove(html: string) {
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

// Same "reason input + confirm in one dialog" pattern used across the app
// (Request/Inventory reject dialogs) — a reject always needs a reason.
async function confirmReject(): Promise<string | null> {
  const { value, isConfirmed } = await Swal.fire({
    title: "ไม่อนุมัติใบลา",
    input: "text",
    inputLabel: "ระบุเหตุผลที่ไม่อนุมัติ",
    inputPlaceholder: "เช่น ข้อมูลไม่ครบ, สิทธิไม่พอ ฯลฯ",
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

interface LeaveDetail {
  LeaveID: number;
  DocumentNo: string | null;
  EmpCode: string;
  Employee: { FullName: string };
  LeaveType: { LeaveTypeCode: string; LeaveTypeName: string; RequireMedicalCert: boolean };
  StartDate: string;
  EndDate: string;
  IsFullDay: boolean;
  HoursRequested: string | null;
  TotalDays: string;
  HasMedicalCert: boolean;
  Status: string;
  RejectReason: string | null;
  RejectedDate: string | null;
}

export default function LeaveDetailView({ leave, canSave, canApprove }: { leave: LeaveDetail; canSave: boolean; canApprove: boolean }) {
  const router = useRouter();
  const [startDate, setStartDate] = useState(leave.StartDate.slice(0, 10));
  const [endDate, setEndDate] = useState(leave.EndDate.slice(0, 10));
  const [isFullDay, setIsFullDay] = useState(leave.IsFullDay);
  const [hoursRequested, setHoursRequested] = useState(leave.HoursRequested ?? "");
  const [hasMedicalCert, setHasMedicalCert] = useState(leave.HasMedicalCert);
  const [message, setMessage] = useState<string | null>(null);

  async function call(path: string, opts?: RequestInit) {
    setMessage(null);
    const res = await fetch(`/api/leave/requests/${leave.LeaveID}${path}`, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || `${body.error}${body.remaining ? ` (คงเหลือ ${body.remaining} วัน)` : ""}`);
      return false;
    }
    router.refresh();
    return true;
  }

  const isDraft = leave.Status === "DRAFT";
  const isSubmitted = leave.Status === "SUBMITTED";
  const awaitingResubmit = leaveIsAwaitingResubmit(leave.Status, leave.RejectReason);

  let totalPreview: string;
  if (isFullDay) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start ? null : Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    totalPreview = days === null ? "-" : `${days} วัน`;
  } else {
    const hours = Number(hoursRequested);
    totalPreview = Number.isFinite(hours) && hours > 0 ? `${hours} ชม. (= ${(hours / LEAVE_HOURS_PER_DAY).toFixed(2)} วัน)` : "-";
  }

  return (
    <div className="flex flex-col gap-4">
      {awaitingResubmit && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          ถูกไม่อนุมัติ: {leave.RejectReason}
          {leave.RejectedDate && <span className="text-red-500"> ({new Date(leave.RejectedDate).toLocaleDateString("th-TH")})</span>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-gray-500">พนักงาน</div>
          <div>
            {leave.Employee.FullName} ({leave.EmpCode})
          </div>
        </div>
        <div>
          <div className="text-gray-500">สถานะ</div>
          <div className={awaitingResubmit ? "text-red-600" : ""}>{awaitingResubmit ? "ไม่อนุมัติ" : (LEAVE_STATUS_LABELS[leave.Status as keyof typeof LEAVE_STATUS_LABELS] ?? leave.Status)}</div>
        </div>
        <div>
          <div className="text-gray-500">ประเภทการลา</div>
          <div>{leave.LeaveType.LeaveTypeName}</div>
        </div>
        <div>
          <div className="text-gray-500">รวม</div>
          <div className="font-medium">{totalPreview}</div>
        </div>

        <label className="flex items-center gap-2">
          <input type="checkbox" disabled={!isDraft || !canSave} checked={isFullDay} onChange={(e) => setIsFullDay(e.target.checked)} />
          <span className="text-gray-500">ทั้งวัน</span>
        </label>
        <div />

        <label className="flex flex-col gap-1">
          <span className="text-gray-500">วันที่เริ่ม</span>
          <input
            type="date"
            disabled={!isDraft || !canSave}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
          />
        </label>
        {isFullDay ? (
          <label className="flex flex-col gap-1">
            <span className="text-gray-500">วันที่สิ้นสุด</span>
            <input
              type="date"
              disabled={!isDraft || !canSave}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-gray-500">จำนวนชั่วโมง</span>
            <input
              type="number"
              step="any"
              disabled={!isDraft || !canSave}
              value={hoursRequested}
              onChange={(e) => setHoursRequested(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
            />
          </label>
        )}

        {leave.LeaveType.RequireMedicalCert && (
          <label className="col-span-2 flex items-center gap-2">
            <input type="checkbox" disabled={!isDraft || !canSave} checked={hasMedicalCert} onChange={(e) => setHasMedicalCert(e.target.checked)} />
            <span className="text-gray-500">แนบใบรับรองแพทย์แล้ว (จำเป็นสำหรับประเภทนี้)</span>
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {isDraft && canSave && (
          <>
            <button
              onClick={() =>
                call("", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ startDate, endDate: isFullDay ? endDate : startDate, isFullDay, hoursRequested: isFullDay ? undefined : Number(hoursRequested), hasMedicalCert }),
                })
              }
              className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              บันทึก
            </button>
            <button onClick={() => call("/submit", { method: "POST" })} className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700">
              ส่งอนุมัติ
            </button>
          </>
        )}
        {isSubmitted && canApprove && (
          <>
            <button
              onClick={async () => {
                if (!(await confirmApprove(`ยืนยันอนุมัติใบลา ${leave.EmpCode} — ${leave.Employee.FullName} (${leave.LeaveType.LeaveTypeName}, ${totalPreview})?`))) return;
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
              ไม่อนุมัติ
            </button>
          </>
        )}
        {leave.Status === "APPROVED" && <p className="text-sm text-gray-500">อนุมัติแล้ว ไม่สามารถแก้ไขได้</p>}
      </div>

      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
