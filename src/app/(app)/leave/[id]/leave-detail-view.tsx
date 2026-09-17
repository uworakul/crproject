"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LEAVE_STATUS_LABELS } from "@/lib/leave";

interface LeaveDetail {
  LeaveID: number;
  EmpCode: string;
  Employee: { FullName: string };
  LeaveType: { LeaveTypeCode: string; LeaveTypeName: string; RequireMedicalCert: boolean };
  StartDate: string;
  EndDate: string;
  TotalDays: string;
  HasMedicalCert: boolean;
  Status: string;
}

export default function LeaveDetailView({ leave, canSave, canApprove }: { leave: LeaveDetail; canSave: boolean; canApprove: boolean }) {
  const router = useRouter();
  const [totalDays, setTotalDays] = useState(leave.TotalDays);
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

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-gray-500">พนักงาน</div>
          <div>
            {leave.Employee.FullName} ({leave.EmpCode})
          </div>
        </div>
        <div>
          <div className="text-gray-500">สถานะ</div>
          <div>{LEAVE_STATUS_LABELS[leave.Status as keyof typeof LEAVE_STATUS_LABELS] ?? leave.Status}</div>
        </div>
        <div>
          <div className="text-gray-500">ประเภทการลา</div>
          <div>{leave.LeaveType.LeaveTypeName}</div>
        </div>
        <div>
          <div className="text-gray-500">วันที่</div>
          <div>
            {new Date(leave.StartDate).toLocaleDateString("th-TH")} - {new Date(leave.EndDate).toLocaleDateString("th-TH")}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-gray-500">จำนวนวัน</span>
          <input
            disabled={!isDraft || !canSave}
            value={totalDays}
            onChange={(e) => setTotalDays(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
          />
        </label>
        {leave.LeaveType.RequireMedicalCert && (
          <label className="flex items-center gap-2">
            <input type="checkbox" disabled={!isDraft || !canSave} checked={hasMedicalCert} onChange={(e) => setHasMedicalCert(e.target.checked)} />
            <span className="text-gray-500">แนบใบรับรองแพทย์แล้ว (จำเป็นสำหรับประเภทนี้)</span>
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {isDraft && canSave && (
          <>
            <button
              onClick={() => call("", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ totalDays, hasMedicalCert }) })}
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
            <button onClick={() => call("/approve", { method: "POST" })} className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700">
              อนุมัติ
            </button>
            <button onClick={() => call("/reject", { method: "POST" })} className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
              ไม่อนุมัติ
            </button>
          </>
        )}
        {leave.Status === "APPROVED" && <p className="text-sm text-gray-500">อนุมัติแล้ว ไม่สามารถแก้ไขได้</p>}
        {leave.Status === "REJECTED" && <p className="text-sm text-gray-500">ไม่อนุมัติ — ยื่นใบลาใหม่ได้หากต้องการ</p>}
      </div>

      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
