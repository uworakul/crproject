"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

interface Group {
  label: string;
  entries: { label: string; tables: string[] }[];
}
interface Cond {
  selected: boolean;
  mode: "ALL" | "RANGE";
  column: string;
  from: string;
  to: string;
}
const emptyCond = (): Cond => ({ selected: false, mode: "ALL", column: "", from: "", to: "" });

export default function DbManagementView({ groups, conditionFields }: { groups: Group[]; conditionFields: Record<string, { column: string; label: string; type: "date" | "code" }[]> }) {
  const router = useRouter();
  const [groupLabel, setGroupLabel] = useState("");
  // Selections are kept per table across group switches.
  const [conds, setConds] = useState<Record<string, Cond>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const group = groups.find((g) => g.label === groupLabel);
  const get = (t: string) => conds[t] ?? emptyCond();
  const patch = (t: string, p: Partial<Cond>) => setConds((c) => ({ ...c, [t]: { ...(c[t] ?? emptyCond()), ...p } }));

  const selectedTables = Object.keys(conds).filter((t) => conds[t].selected);

  function buildItems(): { items: unknown[] } | { error: string } {
    const items: unknown[] = [];
    for (const t of selectedTables) {
      const c = conds[t];
      if (c.mode === "ALL") {
        items.push({ table: t, mode: "ALL" });
      } else {
        if (!c.column || !c.from || !c.to) return { error: `${t}: กรุณาเลือก field และช่วงให้ครบ` };
        if (c.from > c.to) return { error: `${t}: ค่าเริ่มต้นต้องไม่เกินค่าสิ้นสุด` };
        items.push({ table: t, mode: "RANGE", column: c.column, from: c.from, to: c.to });
      }
    }
    return { items };
  }

  async function post(path: string, body: unknown) {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, body: await res.json() };
  }

  const countsHtml = (counts: Record<string, number>) =>
    `<table style="margin:8px auto;text-align:left;font-size:14px">${Object.entries(counts)
      .map(([t, n]) => `<tr><td style="padding:2px 12px 2px 0">${t}</td><td style="text-align:right"><b>${n.toLocaleString("th-TH")}</b> แถว</td></tr>`)
      .join("")}</table>`;

  async function start() {
    setMessage(null);
    const built = buildItems();
    if ("error" in built) {
      setMessage({ ok: false, text: built.error });
      return;
    }
    setBusy(true);
    try {
      // Step 1: exact preview (cascade included) so nothing is a surprise.
      const preview = await post("/api/db-management/preview", { items: built.items });
      if (!preview.ok) {
        setMessage({ ok: false, text: preview.body.message || preview.body.error || "ตรวจสอบไม่สำเร็จ" });
        return;
      }
      const counts = preview.body.counts as Record<string, number>;
      const total = Object.values(counts).reduce((s, n) => s + n, 0);
      const step1 = await Swal.fire({
        icon: "warning",
        title: "ยืนยันการลบข้อมูล?",
        html: `ข้อมูลที่จะถูกลบถาวร รวม <b>${total.toLocaleString("th-TH")}</b> แถว (รวมตารางที่ผูกกัน)${countsHtml(counts)}`,
        showCancelButton: true,
        confirmButtonText: "Confirm",
        cancelButtonText: "ยกเลิก",
        confirmButtonColor: "#dc2626",
      });
      if (!step1.isConfirmed) return;
      if (total === 0) {
        setMessage({ ok: true, text: "ไม่มีข้อมูลที่ตรงเงื่อนไข" });
        return;
      }
      // Step 2: type DELETE.
      const step2 = await Swal.fire({
        icon: "error",
        title: "พิมพ์ DELETE เพื่อยืนยัน",
        text: "การลบนี้ไม่สามารถกู้คืนได้",
        input: "text",
        inputPlaceholder: "DELETE",
        showCancelButton: true,
        confirmButtonText: "Confirm ลบข้อมูล",
        cancelButtonText: "ยกเลิก",
        confirmButtonColor: "#dc2626",
        inputValidator: (v) => (v === "DELETE" ? undefined : "ต้องพิมพ์ DELETE (ตัวพิมพ์ใหญ่) ให้ตรง"),
      });
      if (!step2.isConfirmed) return;

      const res = await post("/api/db-management/delete", { items: built.items, confirmText: step2.value });
      if (!res.ok) {
        setMessage({ ok: false, text: res.body.message || res.body.error || "ลบไม่สำเร็จ (ไม่มีข้อมูลถูกลบ)" });
        return;
      }
      setMessage({ ok: true, text: `ลบข้อมูลแล้ว รวม ${Object.values(res.body.counts as Record<string, number>).reduce((s, n) => s + n, 0).toLocaleString("th-TH")} แถว` });
      setConds({});
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <label className="block text-sm text-gray-700">
        เมนูหลัก
        <select className="mt-1 block w-full max-w-sm rounded border border-gray-300 px-3 py-2" value={groupLabel} onChange={(e) => setGroupLabel(e.target.value)}>
          <option value="">- เลือกเมนูหลัก -</option>
          {groups.map((g) => (
            <option key={g.label} value={g.label}>
              {g.label}
            </option>
          ))}
        </select>
      </label>

      {group && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2">เมนูย่อย</th>
                <th className="px-3 py-2">ตาราง</th>
                <th className="px-3 py-2">เงื่อนไขการลบ</th>
              </tr>
            </thead>
            <tbody>
              {group.entries.flatMap((entry) =>
                entry.tables.map((t, i) => {
                  const c = get(t);
                  const cols = conditionFields[t] ?? [];
                  const colType = cols.find((f) => f.column === (c.column || cols[0]?.column))?.type ?? "date";
                  return (
                    <tr key={t} className="border-t border-gray-100 align-top hover:bg-purple-50">
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={c.selected} onChange={(e) => patch(t, { selected: e.target.checked })} />
                      </td>
                      <td className="px-3 py-2 text-gray-700">{i === 0 ? entry.label : ""}</td>
                      <td className="px-3 py-2 font-mono text-gray-900">{t}</td>
                      <td className="px-3 py-2">
                        {c.selected ? (
                          <div className="space-y-2">
                            <div className="flex gap-4">
                              <label className="flex items-center gap-1">
                                <input type="radio" checked={c.mode === "ALL"} onChange={() => patch(t, { mode: "ALL" })} /> ลบทั้งหมด
                              </label>
                              <label className={`flex items-center gap-1 ${cols.length === 0 ? "text-gray-400" : ""}`}>
                                <input type="radio" disabled={cols.length === 0} checked={c.mode === "RANGE"} onChange={() => patch(t, { mode: "RANGE", column: c.column || cols[0].column })} /> ใส่เงื่อนไข
                              </label>
                            </div>
                            {cols.length === 0 && <div className="text-xs text-gray-400">ตารางนี้ไม่มี field ที่ใช้เป็นเงื่อนไข — ลบได้เฉพาะทั้งหมด</div>}
                            {c.mode === "RANGE" && (
                              <div className="flex flex-wrap items-center gap-2">
                                <select className="rounded border border-gray-300 px-2 py-1" value={c.column} onChange={(e) => patch(t, { column: e.target.value, from: "", to: "" })}>
                                  {cols.map((col) => (
                                    <option key={col.column} value={col.column}>
                                      {col.label}
                                    </option>
                                  ))}
                                </select>
                                <input type={colType} placeholder={colType === "code" ? "จากรหัส" : undefined} className="rounded border border-gray-300 px-2 py-1" value={c.from} onChange={(e) => patch(t, { from: e.target.value })} />
                                <span>{colType === "code" ? "ถึง" : "-"}</span>
                                <input type={colType} placeholder={colType === "code" ? "ถึงรหัส" : undefined} className="rounded border border-gray-300 px-2 py-1" value={c.to} onChange={(e) => patch(t, { to: e.target.value })} />
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={start} disabled={busy || selectedTables.length === 0} className="rounded bg-red-600 px-4 py-2 font-medium text-white disabled:opacity-40">
          {busy ? "กำลังตรวจสอบ..." : `ลบข้อมูลที่เลือก (${selectedTables.length} ตาราง)`}
        </button>
        {selectedTables.length > 0 && <span className="text-xs text-gray-500">รวมทุกเมนูหลักที่เลือกไว้</span>}
      </div>
      {message && <p className={`rounded p-3 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>}
    </div>
  );
}
