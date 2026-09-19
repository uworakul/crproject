"use client";

import { useState } from "react";
import Swal from "sweetalert2";
import { MEMO_TYPE_VALUES, MEMO_TYPE_LABELS, type MemoType } from "@/lib/validation";

interface HistoryRow {
  HistoryID: string;
  MemoType: string;
  MemoText: string;
  RecordedBy: string;
  RecordedDate: string;
}

async function confirmDeleteNote(): Promise<boolean> {
  const result = await Swal.fire({
    html: "ยืนยันการลบบันทึกนี้?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

export default function HistoryTab({
  empCode,
  initialHistory,
  canSave,
}: {
  empCode: string;
  initialHistory: HistoryRow[];
  canSave: boolean;
}) {
  const [history, setHistory] = useState(initialHistory);
  const [memoType, setMemoType] = useState<MemoType>("GENERAL");
  const [memoText, setMemoText] = useState("");
  const [filterType, setFilterType] = useState<MemoType | "ALL">("ALL");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const filtered = filterType === "ALL" ? history : history.filter((h) => h.MemoType === filterType);

  async function addMemo() {
    if (!memoText.trim()) return;
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch(`/api/employees/${empCode}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoType, memoText }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      setHistory([body, ...history]);
      setMemoText("");
    } finally {
      setPending(false);
    }
  }

  async function deleteMemo(historyId: string) {
    if (!(await confirmDeleteNote())) return;
    setMessage(null);
    const res = await fetch(`/api/employees/${empCode}/history/${historyId}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    setHistory(history.filter((h) => h.HistoryID !== historyId));
  }

  return (
    <div className="flex flex-col gap-4">
      {canSave && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-gray-300 p-3">
          <div className="flex gap-2">
            {MEMO_TYPE_VALUES.map((t) => (
              <label key={t} className="flex items-center gap-1 text-xs text-gray-600">
                <input type="radio" name="memoType" checked={memoType === t} onChange={() => setMemoType(t)} />
                {MEMO_TYPE_LABELS[t]}
              </label>
            ))}
          </div>
          <textarea
            value={memoText}
            onChange={(e) => setMemoText(e.target.value)}
            placeholder="บันทึกข้อความ..."
            rows={2}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            onClick={addMemo}
            disabled={pending || !memoText.trim()}
            className="w-fit rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            + บันทึก
          </button>
        </div>
      )}
      {message && <p className="text-sm text-red-600">{message}</p>}

      <div className="flex gap-1 text-xs">
        <button
          onClick={() => setFilterType("ALL")}
          className={`rounded px-2.5 py-1 ${filterType === "ALL" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
          ทั้งหมด
        </button>
        {MEMO_TYPE_VALUES.map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`rounded px-2.5 py-1 ${filterType === t ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {MEMO_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((h) => (
          <div key={h.HistoryID} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
            <div className="mb-1 flex items-center gap-2 text-xs text-gray-400">
              <span className="rounded bg-gray-100 px-1.5 py-0.5">{MEMO_TYPE_LABELS[h.MemoType as MemoType]}</span>
              <span>{h.RecordedBy}</span>
              <span>{new Date(h.RecordedDate).toLocaleString("th-TH")}</span>
              {canSave && (
                <button onClick={() => deleteMemo(h.HistoryID)} className="ml-auto text-red-500 hover:underline">
                  ลบ
                </button>
              )}
            </div>
            <p className="whitespace-pre-wrap text-gray-800">{h.MemoText}</p>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-gray-400">ยังไม่มีประวัติ</p>}
      </div>
    </div>
  );
}
