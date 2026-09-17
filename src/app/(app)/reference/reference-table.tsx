"use client";

import { useState } from "react";

export interface FieldDef {
  key: string; // matches the API's JSON field name (PascalCase, from Prisma)
  label: string;
  type: "text" | "number" | "percent" | "date"; // percent: stored 0-1, edited as a 0-100 field
  isKey?: boolean; // primary key — shown but not editable once created
  hidden?: boolean; // not rendered as a column or form input, but still tracked
  // (e.g. an auto-increment PK used as the API's URL id when the visible
  // "code" column is a different, more meaningful field — see ref_black_list)
}

interface Props {
  apiBase: string; // e.g. "/api/reference/banks"
  fields: FieldDef[];
  hasIsActive?: boolean;
  canSave: boolean;
  canDelete: boolean;
  initialRows: Record<string, unknown>[];
}

function emptyForm(fields: FieldDef[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, ""]));
}

function toApiKey(key: string) {
  return key.charAt(0).toLowerCase() + key.slice(1);
}

function displayValue(field: FieldDef, value: unknown) {
  if (value === null || value === undefined) return "-";
  if (field.type === "percent") return `${(Number(value) * 100).toFixed(2)}%`;
  if (field.type === "date") return new Date(String(value)).toLocaleDateString("th-TH");
  return String(value);
}

// API dates come back as full ISO timestamps — <input type="date"> needs
// just the YYYY-MM-DD portion to display/edit correctly.
function toDateInputValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export default function ReferenceTable({ apiBase, fields, hasIsActive, canSave, canDelete, initialRows }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [form, setForm] = useState(emptyForm(fields));
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const keyField = fields.find((f) => f.isKey)!;
  const visibleFields = fields.filter((f) => !f.hidden);

  async function refresh() {
    const res = await fetch(apiBase);
    if (res.ok) setRows(await res.json());
  }

  function toApiBody(values: Record<string, string>) {
    const body: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = values[f.key];
      if (raw === "") continue;
      body[toApiKey(f.key)] = f.type === "number" ? Number(raw) : f.type === "percent" ? Number(raw) / 100 : raw;
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
          f.type === "percent" ? String(Number(row[f.key]) * 100) : f.type === "date" ? toDateInputValue(row[f.key]) : String(row[f.key] ?? ""),
        ]),
      ),
    );
  }

  async function saveEdit(id: string) {
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

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
            <tr>
              {visibleFields.map((f) => (
                <th key={f.key} className="px-3 py-2 font-medium">
                  {f.label}
                </th>
              ))}
              {hasIsActive && <th className="px-3 py-2 font-medium">สถานะ</th>}
              {(canSave || canDelete) && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = String(row[keyField.key]);
              const isEditing = editingId === id;
              return (
                <tr key={id} className="border-t border-gray-100 hover:bg-gray-50">
                  {visibleFields.map((f) => (
                    <td key={f.key} className="px-3 py-2">
                      {isEditing && !f.isKey ? (
                        <input
                          type={f.type === "date" ? "date" : "text"}
                          value={editForm[f.key] ?? ""}
                          onChange={(e) => setEditForm({ ...editForm, [f.key]: e.target.value })}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                        />
                      ) : (
                        displayValue(f, row[f.key])
                      )}
                    </td>
                  ))}
                  {hasIsActive && (
                    <td className="px-3 py-2">
                      {row.IsActive ? <span className="text-green-600">ใช้งาน</span> : <span className="text-red-500">ระงับ</span>}
                    </td>
                  )}
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={visibleFields.length + 2} className="px-3 py-6 text-center text-gray-400">
                  ยังไม่มีข้อมูล
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canSave && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-gray-300 p-3">
          {visibleFields.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-xs text-gray-500">
              {f.label}
              <input
                type={f.type === "date" ? "date" : "text"}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="w-32 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
              />
            </label>
          ))}
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
