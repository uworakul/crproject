"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_VALUES } from "@/lib/validation";

interface Menu {
  DocumentType: string;
  MenuNameTH: string;
  MenuNameEN: string;
  ModuleGroup: string;
}
interface Site {
  SiteCode: string;
  SiteName: string;
}
interface PermissionRow {
  DocumentType: string;
  SiteCode: string | null;
  CanRead: boolean;
  CanSave: boolean;
  CanDelete: boolean;
  CanApprove: boolean;
}
interface Target {
  UserID: string;
  DisplayName: string;
  Email: string | null;
  Role: string;
  DefaultSiteCode: string | null;
  IsActive: boolean;
  Permissions: PermissionRow[];
}

const ACTIONS = [
  { key: "CanRead", label: "อ่าน" },
  { key: "CanSave", label: "บันทึก" },
  { key: "CanDelete", label: "ลบ" },
  { key: "CanApprove", label: "อนุมัติ" },
] as const;

export default function UserEditForm({
  target,
  menus,
  sites,
  otherUsers,
  canSave,
  isSelf,
}: {
  target: Target;
  menus: Menu[];
  sites: Site[];
  otherUsers: { UserID: string; DisplayName: string }[];
  canSave: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [info, setInfo] = useState({
    displayName: target.DisplayName,
    email: target.Email ?? "",
    role: target.Role,
    defaultSiteCode: target.DefaultSiteCode ?? "",
    isActive: target.IsActive,
  });
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [infoPending, setInfoPending] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwPending, setPwPending] = useState(false);

  const initialPerms = new Map(
    menus.map((m) => {
      const row = target.Permissions.find((p) => p.DocumentType === m.DocumentType && p.SiteCode === null);
      return [
        m.DocumentType,
        {
          CanRead: row?.CanRead ?? false,
          CanSave: row?.CanSave ?? false,
          CanDelete: row?.CanDelete ?? false,
          CanApprove: row?.CanApprove ?? false,
        },
      ];
    }),
  );
  const [perms, setPerms] = useState(initialPerms);
  const [permMsg, setPermMsg] = useState<string | null>(null);
  const [permPending, setPermPending] = useState(false);

  const [copyFrom, setCopyFrom] = useState("");
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [copyPending, setCopyPending] = useState(false);

  async function saveInfo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInfoPending(true);
    setInfoMsg(null);
    try {
      const res = await fetch(`/api/users/${target.UserID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...info, defaultSiteCode: info.defaultSiteCode || null }),
      });
      const body = await res.json().catch(() => ({}));
      setInfoMsg(res.ok ? "บันทึกแล้ว" : body.message || body.error || "บันทึกไม่สำเร็จ");
      if (res.ok) router.refresh();
    } finally {
      setInfoPending(false);
    }
  }

  async function savePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPwPending(true);
    setPwMsg(null);
    try {
      const res = await fetch(`/api/users/${target.UserID}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const body = await res.json().catch(() => ({}));
      setPwMsg(res.ok ? "เปลี่ยนรหัสผ่านแล้ว" : body.message || body.error || "เปลี่ยนรหัสผ่านไม่สำเร็จ");
      if (res.ok) setNewPassword("");
    } finally {
      setPwPending(false);
    }
  }

  function togglePerm(documentType: string, action: (typeof ACTIONS)[number]["key"]) {
    setPerms((prev) => {
      const next = new Map(prev);
      const current = next.get(documentType)!;
      next.set(documentType, { ...current, [action]: !current[action] });
      return next;
    });
  }

  async function savePermissions() {
    setPermPending(true);
    setPermMsg(null);
    try {
      const payload = menus.map((m) => {
        const p = perms.get(m.DocumentType)!;
        return {
          documentType: m.DocumentType,
          siteCode: null,
          canRead: p.CanRead,
          canSave: p.CanSave,
          canDelete: p.CanDelete,
          canApprove: p.CanApprove,
        };
      });
      const res = await fetch(`/api/users/${target.UserID}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      setPermMsg(res.ok ? "บันทึกสิทธิ์แล้ว" : body.message || body.error || "บันทึกสิทธิ์ไม่สำเร็จ");
    } finally {
      setPermPending(false);
    }
  }

  async function copyPermissions() {
    if (!copyFrom) return;
    setCopyPending(true);
    setCopyMsg(null);
    try {
      const res = await fetch(`/api/users/${target.UserID}/copy-permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromUserId: copyFrom }),
      });
      const body = await res.json().catch(() => ({}));
      setCopyMsg(res.ok ? "คัดลอกสิทธิ์แล้ว — รีเฟรชเพื่อดูผล" : body.message || body.error || "คัดลอกสิทธิ์ไม่สำเร็จ");
      if (res.ok) router.refresh();
    } finally {
      setCopyPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Basic info */}
      <form onSubmit={saveInfo} className="flex flex-col gap-3 rounded border border-gray-200 p-4">
        <h2 className="font-semibold">ข้อมูลผู้ใช้งาน</h2>
        <Field label="ชื่อที่แสดง">
          <input
            disabled={!canSave}
            value={info.displayName}
            onChange={(e) => setInfo({ ...info, displayName: e.target.value })}
            className="rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
          />
        </Field>
        <Field label="อีเมล">
          <input
            disabled={!canSave}
            type="email"
            value={info.email}
            onChange={(e) => setInfo({ ...info, email: e.target.value })}
            className="rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
          />
        </Field>
        <Field label="สิทธิ์ (Role)">
          <select
            disabled={!canSave}
            value={info.role}
            onChange={(e) => setInfo({ ...info, role: e.target.value })}
            className="rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
          >
            {ROLE_VALUES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="หน่วยงานหลัก">
          <select
            disabled={!canSave}
            value={info.defaultSiteCode}
            onChange={(e) => setInfo({ ...info, defaultSiteCode: e.target.value })}
            className="rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
          >
            <option value="">- ไม่ระบุ -</option>
            {sites.map((s) => (
              <option key={s.SiteCode} value={s.SiteCode}>
                {s.SiteName}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            disabled={!canSave}
            type="checkbox"
            checked={info.isActive}
            onChange={(e) => setInfo({ ...info, isActive: e.target.checked })}
          />
          ใช้งานอยู่ (ยกเลิกติ๊กเพื่อระงับบัญชี)
        </label>
        {canSave && (
          <button type="submit" disabled={infoPending} className="w-fit rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            {infoPending ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        )}
        {infoMsg && <p className="text-sm text-gray-600">{infoMsg}</p>}
      </form>

      {/* Password */}
      {(canSave || isSelf) && (
        <form onSubmit={savePassword} className="flex flex-col gap-3 rounded border border-gray-200 p-4">
          <h2 className="font-semibold">เปลี่ยนรหัสผ่าน</h2>
          <Field label="รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)">
            <input
              required
              type="password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2"
            />
          </Field>
          <button type="submit" disabled={pwPending} className="w-fit rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            {pwPending ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
          </button>
          {pwMsg && <p className="text-sm text-gray-600">{pwMsg}</p>}
        </form>
      )}

      {/* Permissions */}
      {canSave && (
        <div className="flex flex-col gap-3 rounded border border-gray-200 p-4">
          <h2 className="font-semibold">สิทธิ์รายเมนู</h2>
          <p className="text-xs text-gray-500">
            ทุกแถวคือสิทธิ์แบบ &quot;ทุกหน่วยงาน&quot; (SiteCode = NULL) — การกำหนดสิทธิ์แยกรายหน่วยงานยังไม่รองรับผ่านหน้านี้
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="py-1 pr-2">เมนู</th>
                  {ACTIONS.map((a) => (
                    <th key={a.key} className="px-2 py-1 text-center">
                      {a.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {menus.map((m) => {
                  const p = perms.get(m.DocumentType)!;
                  return (
                    <tr key={m.DocumentType} className="border-b border-gray-100">
                      <td className="py-1 pr-2">
                        <div>{m.MenuNameTH}</div>
                        <div className="text-xs text-gray-400">{m.DocumentType}</div>
                      </td>
                      {ACTIONS.map((a) => (
                        <td key={a.key} className="px-2 py-1 text-center">
                          <input
                            type="checkbox"
                            checked={p[a.key]}
                            onChange={() => togglePerm(m.DocumentType, a.key)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            onClick={savePermissions}
            disabled={permPending}
            className="w-fit rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {permPending ? "กำลังบันทึก..." : "บันทึกสิทธิ์"}
          </button>
          {permMsg && <p className="text-sm text-gray-600">{permMsg}</p>}

          <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-4">
            <span className="text-sm text-gray-600">คัดลอกสิทธิ์จาก:</span>
            <select
              value={copyFrom}
              onChange={(e) => setCopyFrom(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="">- เลือกผู้ใช้งาน -</option>
              {otherUsers.map((u) => (
                <option key={u.UserID} value={u.UserID}>
                  {u.UserID} — {u.DisplayName}
                </option>
              ))}
            </select>
            <button
              onClick={copyPermissions}
              disabled={!copyFrom || copyPending}
              className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
            >
              {copyPending ? "กำลังคัดลอก..." : "คัดลอก"}
            </button>
            {copyMsg && <span className="text-sm text-gray-600">{copyMsg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-gray-600">{label}</span>
      {children}
    </label>
  );
}
