"use client";

import { useRef, useState } from "react";
import Swal from "sweetalert2";
import { toBuddhistYear, toGregorianYear } from "@/lib/buddhist-year";

async function confirmDialog(lines: string | string[]) {
  const html = (Array.isArray(lines) ? lines : [lines]).filter(Boolean).join("<br>");
  const result = await Swal.fire({
    html,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#111827",
    cancelButtonColor: "#9ca3af",
  });
  return result.isConfirmed;
}

// Import needs a 3-way answer, not a plain confirm: clear existing data
// first, keep it and add/update on top, or abandon the import entirely.
async function confirmImportClearFirst(): Promise<"clear" | "keep" | null> {
  const result = await Swal.fire({
    title: "นำเข้าข้อมูลจาก Excel",
    text: "ต้องการลบข้อมูลเดิมทั้งหมดก่อนนำเข้าหรือไม่?",
    icon: "question",
    showDenyButton: true,
    showCancelButton: true,
    confirmButtonText: "ลบข้อมูลเดิมทั้งหมดก่อน",
    denyButtonText: "ไม่ลบ (เพิ่ม/อัปเดตทับ)",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc2626",
    denyButtonColor: "#111827",
    cancelButtonColor: "#9ca3af",
  });
  if (result.isConfirmed) return "clear";
  if (result.isDenied) return "keep";
  return null;
}

export interface FieldDef {
  key: string; // matches the API's JSON field name (PascalCase, from Prisma)
  label: string;
  type: "text" | "number" | "percent" | "date" | "year" | "checkbox"; // percent: stored 0-1, edited as a 0-100 field; year: stored ค.ศ., displayed/edited as พ.ศ.; checkbox: boolean, displays "Yes" when true
  isKey?: boolean; // primary key — shown but not editable once created
  hidden?: boolean; // not rendered as a column or form input, but still tracked
  // (e.g. an auto-increment PK used as the API's URL id when the visible
  // "code" column is a different, more meaningful field — see ref_black_list)
}

interface Props {
  apiBase: string; // e.g. "/api/reference/banks"
  fields: FieldDef[];
  hasIsActive?: boolean; // shows a ระงับ/เปิดใช้งาน toggle instead of ลบ
  canSave: boolean;
  canDelete: boolean;
  allowAdd?: boolean; // false hides the "+ เพิ่ม" add-new-row form even when canSave — for fixed row sets (e.g. ค่าลดหย่อน) editable in place but not extendable
  showSearch?: boolean; // false hides the search box — for small fixed row sets where it adds no value
  sortable?: boolean; // false disables click-to-sort headers and keeps rows in the order the API/query returns them
  showRowNumber?: boolean; // true adds a leading "ลำดับ" column showing each row's position in the current (unsorted, unless sortable) order
  allowExport?: boolean; // shows a "ส่งออก Excel" button hitting GET {apiBase}/export
  allowImport?: boolean; // shows a "นำเข้า Excel" button hitting POST {apiBase}/import (canSave-gated)
  initialRows: Record<string, unknown>[];
}

function emptyForm(fields: FieldDef[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, f.type === "checkbox" ? "false" : ""]));
}

// PascalCase field name -> the API's camelCase JSON key. A plain
// charAt(0).toLowerCase() breaks on a leading acronym run — "SSORegistNo"
// became "sSORegistNo" instead of "ssoRegistNo" (silently dropped by the
// API, which only checks for its exact expected key) — so the whole
// leading uppercase run is lowercased, except its last letter is kept
// capitalized when it starts the next word (e.g. "IDCardNo" -> "idCardNo").
function toApiKey(key: string) {
  const match = key.match(/^[A-Z]+/);
  if (!match) return key;
  const upperRun = match[0];
  const rest = key.slice(upperRun.length);
  if (upperRun.length > 1 && rest.length > 0) {
    return upperRun.slice(0, -1).toLowerCase() + upperRun.slice(-1) + rest;
  }
  return upperRun.toLowerCase() + rest;
}

function displayValue(field: FieldDef, value: unknown) {
  if (field.type === "checkbox") return value === true ? "Yes" : "-";
  if (value === null || value === undefined) return "-";
  if (field.type === "percent") return `${(Number(value) * 100).toFixed(2)}%`;
  if (field.type === "date") return new Date(String(value)).toLocaleDateString("th-TH");
  if (field.type === "year") return String(toBuddhistYear(Number(value)));
  return String(value);
}

// API dates come back as full ISO timestamps — <input type="date"> needs
// just the YYYY-MM-DD portion to display/edit correctly.
function toDateInputValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function compareValues(field: FieldDef, a: unknown, b: unknown) {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  if (field.type === "number" || field.type === "percent" || field.type === "year") return Number(a) - Number(b);
  if (field.type === "date") return new Date(String(a)).getTime() - new Date(String(b)).getTime();
  return String(a).localeCompare(String(b), "th");
}

export default function ReferenceTable({
  apiBase,
  fields,
  hasIsActive,
  canSave,
  canDelete,
  allowAdd = true,
  showSearch = true,
  sortable = true,
  showRowNumber = false,
  allowExport = false,
  allowImport = false,
  initialRows,
}: Props) {
  const [rows, setRows] = useState(initialRows);
  const [form, setForm] = useState(emptyForm(fields));
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sortKey, setSortKey] = useState<string | null>(sortable ? (fields.filter((f) => !f.hidden)[0]?.key ?? null) : null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const keyField = fields.find((f) => f.isKey)!;
  const visibleFields = fields.filter((f) => !f.hidden);
  const nameField = visibleFields.find((f) => !f.isKey);

  const searchNorm = search.trim().toLowerCase();
  const filteredRows = searchNorm
    ? rows.filter((row) => {
        const codeText = displayValue(keyField, row[keyField.key]).toLowerCase();
        const nameText = nameField ? displayValue(nameField, row[nameField.key]).toLowerCase() : "";
        return codeText.includes(searchNorm) || nameText.includes(searchNorm);
      })
    : rows;

  const sortField = sortKey ? fields.find((f) => f.key === sortKey) : undefined;
  const sortedRows = sortField
    ? [...filteredRows].sort((a, b) => {
        const cmp = compareValues(sortField, a[sortField.key], b[sortField.key]);
        return sortDir === "asc" ? cmp : -cmp;
      })
    : filteredRows;

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function refresh() {
    const res = await fetch(apiBase);
    if (res.ok) setRows(await res.json());
  }

  function toApiBody(values: Record<string, string>) {
    const body: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = values[f.key];
      if (raw === "") continue;
      body[toApiKey(f.key)] =
        f.type === "number"
          ? Number(raw)
          : f.type === "percent"
            ? Number(raw) / 100
            : f.type === "year"
              ? toGregorianYear(Number(raw))
              : f.type === "checkbox"
                ? raw === "true"
                : raw;
    }
    return body;
  }

  async function handleAdd() {
    setMessage(null);
    setAdding(true);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toApiBody(form)),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      setForm(emptyForm(fields));
      await refresh();
    } finally {
      setAdding(false);
    }
  }

  function startEdit(row: Record<string, unknown>) {
    const id = String(row[keyField.key]);
    setEditingId(id);
    setEditForm(
      Object.fromEntries(
        fields.map((f) => [
          f.key,
          f.type === "percent"
            ? String(Number(row[f.key]) * 100)
            : f.type === "date"
              ? toDateInputValue(row[f.key])
              : f.type === "year"
                ? String(toBuddhistYear(Number(row[f.key])))
                : f.type === "checkbox"
                  ? String(row[f.key] === true)
                  : String(row[f.key] ?? ""),
        ]),
      ),
    );
  }

  async function saveEdit(id: string) {
    if (!(await confirmDialog("ยืนยันการบันทึก?"))) return;
    setMessage(null);
    const res = await fetch(`${apiBase}/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toApiBody(editForm)),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    setEditingId(null);
    await refresh();
  }

  async function toggleActive(row: Record<string, unknown>) {
    const id = String(row[keyField.key]);
    const isActive = row.IsActive as boolean;
    if (!(await confirmDialog(isActive ? "ยืนยันการระงับ?" : "ยืนยันการเปิดใช้งาน?"))) return;
    setMessage(null);
    const res = isActive
      ? await fetch(`${apiBase}/${encodeURIComponent(id)}`, { method: "DELETE" })
      : await fetch(`${apiBase}/${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: true }),
        });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setMessage(body.message || body.error);
    await refresh();
  }

  async function handleDelete(row: Record<string, unknown>) {
    const codeText = `${keyField.label}: ${displayValue(keyField, row[keyField.key])}`;
    const nameText = nameField ? `${nameField.label}: ${displayValue(nameField, row[nameField.key])}` : "";
    if (!(await confirmDialog(["ยืนยันการลบ?", codeText, nameText]))) return;
    const id = String(row[keyField.key]);
    setMessage(null);
    const res = await fetch(`${apiBase}/${encodeURIComponent(id)}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.message || body.error);
      return;
    }
    await refresh();
  }

  async function handleExport() {
    setMessage(null);
    const res = await fetch(`${apiBase}/export`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMessage(body.message || body.error);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${apiBase.split("/").filter(Boolean).pop()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-selecting the same file still fires onChange
    if (!file) return;

    const choice = await confirmImportClearFirst();
    if (!choice) return;

    setMessage(null);
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("clearFirst", choice === "clear" ? "true" : "false");
      const res = await fetch(`${apiBase}/import`, { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      await Swal.fire({
        icon: "success",
        title: "นำเข้าสำเร็จ",
        text: `เพิ่มใหม่ ${body.created} รายการ, อัปเดต ${body.updated} รายการ`,
      });
      await refresh();
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {(showSearch || allowExport || allowImport) && (
        <div className="flex flex-wrap items-center gap-2">
          {showSearch && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`ค้นหา${keyField.label}หรือ${nameField?.label ?? "ชื่อ"}`}
              className="w-64 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            />
          )}
          {allowExport && (
            <button
              onClick={handleExport}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              ส่งออก Excel
            </button>
          )}
          {allowImport && canSave && (
            <>
              <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFileChange} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {importing ? "กำลังนำเข้า..." : "นำเข้า Excel"}
              </button>
            </>
          )}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              {showRowNumber && <th className="px-3 py-2 font-medium">ลำดับ</th>}
              {visibleFields.map((f) =>
                sortable ? (
                  <th
                    key={f.key}
                    onClick={() => handleSort(f.key)}
                    className="cursor-pointer select-none px-3 py-2 font-medium hover:text-gray-900"
                  >
                    {f.label}
                    {sortKey === f.key && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </th>
                ) : (
                  <th key={f.key} className="px-3 py-2 font-medium">
                    {f.label}
                  </th>
                ),
              )}
              {(canSave || canDelete) && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => {
              const id = String(row[keyField.key]);
              const isEditing = editingId === id;
              return (
                <tr key={id} className="border-t border-gray-100 hover:bg-gray-50">
                  {showRowNumber && <td className="px-3 py-2 text-gray-500">{idx + 1}</td>}
                  {visibleFields.map((f) => (
                    <td key={f.key} className="px-3 py-2">
                      {isEditing && !f.isKey ? (
                        f.type === "checkbox" ? (
                          <input
                            type="checkbox"
                            checked={editForm[f.key] === "true"}
                            onChange={(e) => setEditForm({ ...editForm, [f.key]: String(e.target.checked) })}
                          />
                        ) : (
                          <input
                            type={f.type === "date" ? "date" : "text"}
                            value={editForm[f.key] ?? ""}
                            onChange={(e) => setEditForm({ ...editForm, [f.key]: e.target.value })}
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                        )
                      ) : (
                        displayValue(f, row[f.key])
                      )}
                    </td>
                  ))}
                  {(canSave || canDelete) && (
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => saveEdit(id)} className="text-gray-900 hover:underline">
                            บันทึก
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-gray-400 hover:underline">
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          {canSave && (
                            <button onClick={() => startEdit(row)} className="text-gray-500 hover:text-gray-900 hover:underline">
                              แก้ไข
                            </button>
                          )}
                          {canDelete && hasIsActive && (
                            <button onClick={() => toggleActive(row)} className="text-gray-500 hover:text-gray-900 hover:underline">
                              {row.IsActive ? "ระงับ" : "เปิดใช้งาน"}
                            </button>
                          )}
                          {canDelete && !hasIsActive && (
                            <button onClick={() => handleDelete(row)} className="text-red-500 hover:underline">
                              ลบ
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={visibleFields.length + 1 + (showRowNumber ? 1 : 0)} className="px-3 py-6 text-center text-gray-400">
                  {rows.length === 0 ? "ยังไม่มีข้อมูล" : "ไม่พบรายการที่ค้นหา"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canSave && allowAdd && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 p-3">
          {visibleFields.map((f) =>
            f.type === "checkbox" ? (
              <label key={f.key} className="flex items-center gap-1 pb-1.5 text-xs text-gray-500">
                <input
                  type="checkbox"
                  checked={form[f.key] === "true"}
                  onChange={(e) => setForm({ ...form, [f.key]: String(e.target.checked) })}
                />
                {f.label}
              </label>
            ) : (
              <label key={f.key} className="flex flex-col gap-1 text-xs text-gray-500">
                {f.label}
                <input
                  type={f.type === "date" ? "date" : "text"}
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="w-32 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                />
              </label>
            ),
          )}
          <button
            onClick={handleAdd}
            disabled={adding}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            + เพิ่ม
          </button>
        </div>
      )}

      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
