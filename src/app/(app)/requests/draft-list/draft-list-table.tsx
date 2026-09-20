"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";

interface HeaderRow {
  RequestHeaderID: number;
  DocumentCode: string;
  DocumentNo: string | null;
  RequestDate: string;
  Remark: string | null;
  SubmittedDate: string | null;
  Details: { Amount: string }[];
}

function money(v: string | number) {
  return Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

async function confirmApprove(label: string): Promise<boolean> {
  const result = await Swal.fire({
    html: `ยืนยันอนุมัติเอกสาร ${label}?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#16a34a",
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

// Same "reason input + confirm in one dialog" pattern as
// confirmDeleteEmployee — a reject always needs a reason, so there's no
// point splitting it into two separate prompts.
async function confirmReject(label: string): Promise<string | null> {
  const { value, isConfirmed } = await Swal.fire({
    title: `ตีกลับเอกสาร ${label}`,
    input: "text",
    inputLabel: "ระบุเหตุผลที่ตีกลับ",
    inputPlaceholder: "เช่น ข้อมูลไม่ครบ, ยอดเงินผิด ฯลฯ",
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

export default function DraftListTable({ rows, canApproveByCode }: { rows: HeaderRow[]; canApproveByCode: Record<string, boolean> }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function label(r: HeaderRow) {
    return `${r.DocumentCode} ${r.DocumentNo ? `#${r.DocumentNo}` : `(คำขอ #${r.RequestHeaderID})`}`;
  }

  async function approve(r: HeaderRow) {
    if (!(await confirmApprove(label(r)))) return;
    setMessage(null);
    setPendingId(r.RequestHeaderID);
    try {
      const res = await fetch(`/api/requests/${r.RequestHeaderID}/approve`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  async function reject(r: HeaderRow) {
    const reason = await confirmReject(label(r));
    if (!reason) return;
    setMessage(null);
    setPendingId(r.RequestHeaderID);
    try {
      const res = await fetch(`/api/requests/${r.RequestHeaderID}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">รหัสเอกสาร</th>
              <th className="px-3 py-2 font-medium">เลขที่เอกสาร</th>
              <th className="px-3 py-2 font-medium">วันที่</th>
              <th className="px-3 py-2 font-medium">หมายเหตุ</th>
              <th className="px-3 py-2 font-medium text-right">จำนวนรายการ</th>
              <th className="px-3 py-2 font-medium text-right">ยอดเงินรวม</th>
              <th className="px-3 py-2 font-medium">ส่งเมื่อ</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = r.Details.reduce((sum, d) => sum + Number(d.Amount), 0);
              const canApprove = canApproveByCode[r.DocumentCode];
              const busy = pendingId === r.RequestHeaderID;
              return (
                <tr key={r.RequestHeaderID} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link href={`/requests/${r.RequestHeaderID}`} className="text-gray-900 hover:underline">
                      {r.DocumentCode}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{r.DocumentNo ?? "-"}</td>
                  <td className="px-3 py-2 text-gray-500">{new Date(r.RequestDate).toLocaleDateString("th-TH")}</td>
                  <td className="px-3 py-2 text-gray-500">{r.Remark ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{r.Details.length}</td>
                  <td className="px-3 py-2 text-right">{money(total)}</td>
                  <td className="px-3 py-2 text-gray-500">{r.SubmittedDate ? new Date(r.SubmittedDate).toLocaleString("th-TH") : "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {canApprove && (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => approve(r)}
                          disabled={busy}
                          className="rounded-md bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          อนุมัติ
                        </button>
                        <button
                          onClick={() => reject(r)}
                          disabled={busy}
                          className="rounded-md border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          ตีกลับ
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-400">
                  ไม่มีรายการรออนุมัติ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
