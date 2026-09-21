"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import { toBuddhistYear } from "@/lib/buddhist-year";

export interface PendingRow {
  worksheetId: number;
  siteCode: string;
  siteName: string;
  workYear: number;
  workMonth: number;
  employeeCount: number;
  submittedBy: string | null;
  submittedDate: string | null;
}

type SortKey = "siteName" | "period" | "employeeCount" | "submittedDate";

function label(r: PendingRow) {
  return `${r.siteName} — ${r.workMonth}/${toBuddhistYear(r.workYear)}`;
}

async function confirmApprove(l: string): Promise<boolean> {
  const result = await Swal.fire({
    html: `ยืนยันอนุมัติ Worksheet ของ ${l}?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#16a34a",
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

async function confirmReject(l: string): Promise<string | null> {
  const { value, isConfirmed } = await Swal.fire({
    title: `ไม่อนุมัติ Worksheet ของ ${l}`,
    input: "text",
    inputLabel: "ระบุเหตุผลที่ไม่อนุมัติ",
    inputPlaceholder: "เช่น กรอกวันผิด, ต้องตรวจซ้ำ ฯลฯ",
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

export default function WorksheetApprovalTable({ rows }: { rows: PendingRow[] }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("submittedDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function compare(a: PendingRow, b: PendingRow) {
    if (sortKey === "employeeCount") return a.employeeCount - b.employeeCount;
    if (sortKey === "submittedDate") {
      const av = a.submittedDate ? new Date(a.submittedDate).getTime() : 0;
      const bv = b.submittedDate ? new Date(b.submittedDate).getTime() : 0;
      return av - bv;
    }
    if (sortKey === "period") return a.workYear * 100 + a.workMonth - (b.workYear * 100 + b.workMonth);
    return a.siteName.localeCompare(b.siteName, "th");
  }

  const visibleRows = [...rows].sort((a, b) => {
    const cmp = compare(a, b);
    return sortDir === "asc" ? cmp : -cmp;
  });

  async function approve(r: PendingRow) {
    if (!(await confirmApprove(label(r)))) return;
    setMessage(null);
    setPendingId(r.worksheetId);
    try {
      const res = await fetch(`/api/worksheets/${r.worksheetId}/approve`, { method: "POST" });
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

  async function reject(r: PendingRow) {
    const reason = await confirmReject(label(r));
    if (!reason) return;
    setMessage(null);
    setPendingId(r.worksheetId);
    try {
      const res = await fetch(`/api/worksheets/${r.worksheetId}/reject`, {
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

  const headers: { key: SortKey; label: string; align?: "right" }[] = [
    { key: "siteName", label: "หน่วยงาน" },
    { key: "period", label: "เดือน/ปี" },
    { key: "employeeCount", label: "จำนวนพนักงาน", align: "right" },
    { key: "submittedDate", label: "ส่งเมื่อ" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              {headers.map((h) => (
                <th
                  key={h.key}
                  onClick={() => handleSort(h.key)}
                  className={`cursor-pointer select-none px-3 py-2 font-medium hover:text-gray-900 ${h.align === "right" ? "text-right" : ""}`}
                >
                  {h.label}
                  {sortKey === h.key && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
                </th>
              ))}
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => {
              const busy = pendingId === r.worksheetId;
              return (
                <tr key={r.worksheetId} className="border-t border-gray-100 hover:bg-purple-50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/worksheet?site=${encodeURIComponent(r.siteCode)}&year=${r.workYear}&month=${r.workMonth}`}
                      className="text-gray-900 hover:underline"
                    >
                      {r.siteName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {r.workMonth}/{toBuddhistYear(r.workYear)}
                  </td>
                  <td className="px-3 py-2 text-right">{r.employeeCount}</td>
                  <td className="px-3 py-2 text-gray-500">{r.submittedDate ? new Date(r.submittedDate).toLocaleString("th-TH") : "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
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
                        ไม่อนุมัติ
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={headers.length + 1} className="px-3 py-6 text-center text-gray-400">
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
