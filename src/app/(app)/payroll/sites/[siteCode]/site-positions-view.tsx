"use client";

import { Fragment, useState } from "react";
import Swal from "sweetalert2";
import SearchableSelect from "../../../searchable-select";
import SitePositionIncomePanel from "./site-position-income-panel";

interface PositionRow {
  SitePositionID: number;
  PositionCode: string;
  Position: { PositionName: string };
}

interface IncomeRow {
  SitePositionIncomeID: number;
  IncomeCode: string;
  IncomeType: { IncomeName: string };
  Amount: string;
  RateBasis: string;
}

async function confirmDeletePosition(name: string): Promise<boolean> {
  const result = await Swal.fire({
    html: `ยืนยันการลบตำแหน่ง "${name}" ออกจากหน่วยงานนี้? (รายได้ที่กำหนดไว้ของตำแหน่งนี้จะถูกลบไปด้วย)`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

export default function SitePositionsView({
  siteCode,
  initialRows,
  incomesByPosition,
  positions,
  incomeTypes,
  canSave,
  canDelete,
}: {
  siteCode: string;
  initialRows: PositionRow[];
  incomesByPosition: Record<number, IncomeRow[]>;
  positions: { PositionCode: string; PositionName: string }[];
  incomeTypes: { IncomeCode: string; IncomeName: string }[];
  canSave: boolean;
  canDelete: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [newPositionCode, setNewPositionCode] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const usedCodes = new Set(rows.map((r) => r.PositionCode));
  const availablePositions = positions.filter((p) => !usedCodes.has(p.PositionCode));

  async function refresh() {
    const res = await fetch(`/api/site-positions?siteCode=${encodeURIComponent(siteCode)}`);
    if (res.ok) setRows(await res.json());
  }

  async function handleAdd() {
    if (!newPositionCode) return;
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/site-positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteCode, positionCode: newPositionCode }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      setNewPositionCode("");
      await refresh();
    } finally {
      setPending(false);
    }
  }

  async function remove(r: PositionRow) {
    if (!(await confirmDeletePosition(r.Position.PositionName))) return;
    setMessage(null);
    const res = await fetch(`/api/site-positions/${r.SitePositionID}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    await refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {/* No overflow-x-auto here (unlike most tables in this app) — this
          table's expanded row nests SitePositionIncomePanel's SearchableSelect
          dropdown, and overflow-x-auto forces overflow-y to auto too (CSS
          spec), which clipped that dropdown right at this box's bottom edge
          (reported 2026-09-21). This table's columns are few/narrow enough
          that horizontal scroll was never actually needed anyway. */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">รหัสตำแหน่ง</th>
              <th className="px-3 py-2 font-medium">ชื่อตำแหน่ง</th>
              <th className="px-3 py-2 font-medium"></th>
              {(canSave || canDelete) && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isExpanded = expandedId === r.SitePositionID;
              return (
                <Fragment key={r.SitePositionID}>
                  <tr className="border-t border-gray-100 hover:bg-purple-50">
                    <td className="px-3 py-2">{r.PositionCode}</td>
                    <td className="px-3 py-2">{r.Position.PositionName}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => setExpandedId(isExpanded ? null : r.SitePositionID)} className="text-gray-500 hover:underline">
                        {isExpanded ? "▾ ซ่อนรายได้" : "▸ จัดการรายได้"}
                      </button>
                    </td>
                    {(canSave || canDelete) && (
                      <td className="px-3 py-2 text-right">
                        {canDelete && (
                          <button onClick={() => remove(r)} className="text-red-500 hover:underline">
                            ลบ
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  {isExpanded && (
                    <tr className="border-t border-gray-100 bg-gray-50">
                      <td colSpan={4} className="px-3 py-3">
                        <SitePositionIncomePanel
                          sitePositionId={r.SitePositionID}
                          initialIncomes={incomesByPosition[r.SitePositionID] ?? []}
                          incomeTypes={incomeTypes}
                          canSave={canSave}
                          canDelete={canDelete}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
                  ยังไม่มีตำแหน่งที่ต้องการสำหรับหน่วยงานนี้
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canSave && expandedId === null && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 p-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            เพิ่มตำแหน่งที่ต้องการ
            <div className="w-64">
              <SearchableSelect
                value={newPositionCode}
                onChange={setNewPositionCode}
                options={availablePositions.map((p) => ({ code: p.PositionCode, label: p.PositionName }))}
                placeholder="เลือกตำแหน่ง"
              />
            </div>
          </label>
          <button
            onClick={handleAdd}
            disabled={pending || !newPositionCode}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            + เพิ่มตำแหน่ง
          </button>
        </div>
      )}
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
