"use client";

import { useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import { REQUEST_DOCUMENT_CODE_VALUES, REQUEST_DOCUMENT_CODE_LABELS, type RequestDocumentCode } from "@/lib/request";

async function confirmDeleteRequest(label: string): Promise<boolean> {
  const result = await Swal.fire({
    html: `ยืนยันการลบเอกสาร ${label}?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

interface HeaderRow {
  RequestHeaderID: number;
  DocumentCode: string;
  DocumentNo: string | null;
  RequestDate: string;
  Remark: string | null;
  Status: string;
  ApprovedDate: string | null;
  RejectedDate: string | null;
  RejectReason: string | null;
  Details: { Amount: string }[];
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "แบบร่าง",
  SUBMITTED: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
};

function money(v: number) {
  return v.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function approvedOrRejectedDate(r: HeaderRow) {
  const d = r.ApprovedDate ?? r.RejectedDate;
  return d ? new Date(d).toLocaleString("th-TH") : "-";
}

export default function RequestGroupView({
  docType,
  documentCodes,
  initialRows,
  canSave,
  canDelete,
}: {
  docType: string;
  documentCodes: RequestDocumentCode[];
  initialRows: HeaderRow[];
  canSave: boolean;
  canDelete: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [form, setForm] = useState<{ documentCode: string; requestDate: string; remark: string }>({
    documentCode: documentCodes[0] ?? "",
    requestDate: new Date().toISOString().slice(0, 10),
    remark: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/requests?docType=${docType}`);
    if (res.ok) setRows(await res.json());
  }

  async function handleDelete(r: HeaderRow) {
    if (!(await confirmDeleteRequest(`${r.DocumentCode} ${r.DocumentNo ? `#${r.DocumentNo}` : `(คำขอ #${r.RequestHeaderID})`}`))) return;
    setMessage(null);
    const res = await fetch(`/api/requests/${r.RequestHeaderID}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    await refresh();
  }

  async function handleCreate() {
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      await refresh();
    } finally {
      setPending(false);
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
              <th className="px-3 py-2 font-medium">สถานะ</th>
              <th className="px-3 py-2 font-medium">วันที่อนุมัติ/ไม่อนุมัติ</th>
              <th className="min-w-[200px] px-3 py-2 font-medium">เหตุผลไม่อนุมัติ</th>
              {canDelete && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = r.Details.reduce((sum, d) => sum + Number(d.Amount), 0);
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
                  <td className="px-3 py-2">{STATUS_LABEL[r.Status] ?? r.Status}</td>
                  <td className="px-3 py-2 text-gray-500">{approvedOrRejectedDate(r)}</td>
                  <td className="px-3 py-2 text-gray-500">{r.Status === "APPROVED" ? "-" : (r.RejectReason ?? "-")}</td>
                  {canDelete && (
                    <td className="px-3 py-2 text-right">
                      {r.Status === "DRAFT" && (
                        <button onClick={() => handleDelete(r)} className="text-red-500 hover:underline">
                          ลบ
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canDelete ? 10 : 9} className="px-3 py-6 text-center text-gray-400">
                  ยังไม่มีรายการ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canSave && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 p-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            รหัสเอกสาร
            <select
              value={form.documentCode}
              onChange={(e) => setForm({ ...form, documentCode: e.target.value })}
              className="w-56 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            >
              {REQUEST_DOCUMENT_CODE_VALUES.filter((c) => documentCodes.includes(c)).map((c) => (
                <option key={c} value={c}>
                  {c} — {REQUEST_DOCUMENT_CODE_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            วันที่
            <input
              type="date"
              value={form.requestDate}
              onChange={(e) => setForm({ ...form, requestDate: e.target.value })}
              className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            หมายเหตุ
            <input
              value={form.remark}
              onChange={(e) => setForm({ ...form, remark: e.target.value })}
              className="w-40 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
          </label>
          <button
            onClick={handleCreate}
            disabled={pending}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            + สร้างเอกสาร
          </button>
        </div>
      )}
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
