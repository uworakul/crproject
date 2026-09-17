"use client";

import { useState } from "react";
import { MEMO_TYPE_VALUES, MEMO_TYPE_LABELS, type MemoType } from "@/lib/validation";

interface HistoryRow {
  HistoryID: string;
  MemoType: string;
  MemoText: string;
  RecordedBy: string;
  RecordedDate: string;
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
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

      <div className="flex flex-col gap-2">
        {history.map((h) => (
          <div key={h.HistoryID} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
            <div className="mb-1 flex items-center gap-2 text-xs text-gray-400">
              <span className="rounded bg-gray-100 px-1.5 py-0.5">{MEMO_TYPE_LABELS[h.MemoType as MemoType]}</span>
              <span>{h.RecordedBy}</span>
              <span>{new Date(h.RecordedDate).toLocaleString("th-TH")}</span>
            </div>
            <p className="whitespace-pre-wrap text-gray-800">{h.MemoText}</p>
          </div>
        ))}
        {history.length === 0 && <p className="text-sm text-gray-400">ยังไม่มีประวัติ</p>}
      </div>
    </div>
  );
}
