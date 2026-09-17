"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface RequestDetail {
  RequestID: number;
  RequestType: string;
  EmpCode: string;
  Employee: { FullName: string };
  Amount: string;
  DeductPerPeriod: string;
  Status: string;
  RejectReason: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "แบบร่าง",
  SUBMITTED: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ตีกลับ",
};

export default function RequestDetailView({
  request,
  canSave,
  canApprove,
}: {
  request: RequestDetail;
  canSave: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(request.Amount);
  const [deductPerPeriod, setDeductPerPeriod] = useState(request.DeductPerPeriod);
  const [rejectReason, setRejectReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function call(path: string, opts?: RequestInit) {
    setMessage(null);
    const res = await fetch(`/api/requests/${request.RequestID}${path}`, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || `${body.error}${body.quotaRemaining ? ` (คงเหลือ ${body.quotaRemaining})` : ""}`);
      return false;
    }
    router.refresh();
    return true;
  }

  const isDraft = request.Status === "DRAFT";
  const isSubmitted = request.Status === "SUBMITTED";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-gray-500">พนักงาน</div>
          <div>
            {request.Employee.FullName} ({request.EmpCode})
          </div>
        </div>
        <div>
          <div className="text-gray-500">สถานะ</div>
          <div>{STATUS_LABEL[request.Status] ?? request.Status}</div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-gray-500">ยอดเบิก (บาท)</span>
          <input
            disabled={!isDraft || !canSave}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-500">หักต่องวด (บาท)</span>
          <input
            disabled={!isDraft || !canSave}
            value={deductPerPeriod}
            onChange={(e) => setDeductPerPeriod(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
          />
        </label>
      </div>

      {request.RejectReason && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">ถูกตีกลับ: {request.RejectReason}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {isDraft && canSave && (
          <>
            <button
              onClick={() => call("", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, deductPerPeriod }) })}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              บันทึก
            </button>
            <button
              onClick={() => call("/submit", { method: "POST" })}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
            >
              ส่งอนุมัติ
            </button>
          </>
        )}
        {isSubmitted && canApprove && (
          <>
            <button
              onClick={() => call("/approve", { method: "POST" })}
              className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
            >
              อนุมัติ
            </button>
            <div className="flex items-center gap-2">
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="เหตุผลที่ตีกลับ"
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <button
                onClick={() => call("/reject", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: rejectReason }) })}
                className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                ตีกลับ
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
