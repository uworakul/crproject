"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_VALUES, EMPLOYEE_TYPE_VALUES, EMPLOYEE_TYPE_LABELS } from "@/lib/validation";
import ChangePasswordForm from "../../change-password/change-password-form";

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
interface Company {
  CompanyCode: string;
  CompanyName: string;
}
interface PermissionRow {
  DocumentType: string;
  SiteCode: string | null;
  CanRead: boolean;
  CanSave: boolean;
  CanDelete: boolean;
  CanSubmit: boolean;
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

// 2026-09-28 permission redesign — "ขออนุมัติ" (Submit) is now a real bit
// distinct from "บันทึก" (Save), not just save reused for both. Shown as
// its own column between Save and Delete.
const ACTIONS = [
  { key: "CanRead", label: "อ่าน" },
  { key: "CanSave", label: "บันทึก" },
  { key: "CanSubmit", label: "ขออนุมัติ" },
  { key: "CanDelete", label: "ลบ" },
  { key: "CanApprove", label: "อนุมัติ" },
] as const;

// Which of the two workflow actions (Submit/ApprovE) actually mean
// something for a given DocumentType — everywhere else shows a blank cell
// instead of a checkbox, so an unused bit never looks like it does
// something. Matches the ~15 real "submit for approval" routes across
// Worksheet/Leave/Requests/Inventory (all Submit+Approve), plus
// PAYROLL_LOCK (Lock=Submit, Approve=Approve) and PAYROLL_CLOSING
// (single-step Close, Approve only — no separate submit tier exists).
const SUBMIT_APPROVE_DOCTYPES = new Set([
  "WORKSHEET",
  "LEAVE_REQUEST",
  "REQUEST_ADVANCE",
  "REQUEST_LOAN",
  "REQUEST_TRAINING",
  "REQUEST_COMMISSION",
  "REQUEST_BONUS",
  "REQUEST_PROMOTE",
  "REQUEST_RESIGN",
  "STOCK_COUNT",
  "STOCK_PURCHASE",
  "STOCK_TRANSFER",
  "STOCK_ISSUE",
  "STOCK_RETURN",
  "PAYROLL_LOCK",
]);
const APPROVE_ONLY_DOCTYPES = new Set(["PAYROLL_CLOSING"]);

function actionApplies(documentType: string, actionKey: (typeof ACTIONS)[number]["key"]): boolean {
  if (actionKey === "CanSubmit") return SUBMIT_APPROVE_DOCTYPES.has(documentType);
  if (actionKey === "CanApprove") return SUBMIT_APPROVE_DOCTYPES.has(documentType) || APPROVE_ONLY_DOCTYPES.has(documentType);
  return true; // Read/Save/Delete always apply
}

// Matches sys_menu.ModuleGroup (see prisma/seed-menus.ts) — reusing the
// grouping the rest of the app (sidebar) already organizes menus by,
// rather than inventing a second parallel taxonomy just for this table.
// "รายได้และรายการหัก" (INCOME_TYPE/DEDUCTION_TYPE) intentionally stays
// inside "ตั้งค่าระบบ/รหัสอ้างอิง" (SYSTEM_SETTING) rather than its own
// section, since that's the seeded ModuleGroup they already belong to.
const GROUP_LABELS: Record<string, string> = {
  SYS_CONFIG: "ตั้งค่าระบบ",
  AUTHORIZATION: "ผู้ใช้งานและสิทธิ์",
  SYSTEM_SETTING: "ตั้งค่าระบบ/รหัสอ้างอิง (รวมรายได้และรายการหัก)",
  EMPLOYEE_MASTER: "ทะเบียนพนักงาน",
  REQUEST_APPROVE: "เอกสารขออนุมัติ",
  INVENTORY: "สินค้าคงคลัง/เครื่องแบบ",
  PAYROLL: "รายการประจำงวด",
  LEAVE: "การลา",
  WORKSHEET: "ใบลงเวลาปฏิบัติงาน",
  DASHBOARD: "Dashboard",
};
const GROUP_ORDER = [
  "SYS_CONFIG",
  "AUTHORIZATION",
  "SYSTEM_SETTING",
  "EMPLOYEE_MASTER",
  "REQUEST_APPROVE",
  "INVENTORY",
  "LEAVE",
  "WORKSHEET",
  "PAYROLL",
  "DASHBOARD",
];

export default function UserEditForm({
  target,
  menus,
  sites,
  otherUsers,
  canSave,
  isSelf,
  companies,
  initialCompanyScope,
  initialEmployeeTypeScope,
}: {
  target: Target;
  menus: Menu[];
  sites: Site[];
  otherUsers: { UserID: string; DisplayName: string }[];
  canSave: boolean;
  isSelf: boolean;
  companies: Company[];
  initialCompanyScope: string[];
  initialEmployeeTypeScope: string[];
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

  // Global scope checklists (2026-09-28) — NOT per-DocumentType like the
  // permission table below. Empty set = unrestricted (sees every
  // company/employee-type) — same "absence = no restriction" convention as
  // the permission table's SiteCode=NULL rows.
  const [companyScope, setCompanyScope] = useState(new Set(initialCompanyScope));
  const [companyScopeMsg, setCompanyScopeMsg] = useState<string | null>(null);
  const [companyScopePending, setCompanyScopePending] = useState(false);

  const [employeeTypeScope, setEmployeeTypeScope] = useState(new Set(initialEmployeeTypeScope));
  const [employeeTypeScopeMsg, setEmployeeTypeScopeMsg] = useState<string | null>(null);
  const [employeeTypeScopePending, setEmployeeTypeScopePending] = useState(false);

  const initialPerms = new Map(
    menus.map((m) => {
      const row = target.Permissions.find((p) => p.DocumentType === m.DocumentType && p.SiteCode === null);
      return [
        m.DocumentType,
        {
          CanRead: row?.CanRead ?? false,
          CanSave: row?.CanSave ?? false,
          CanDelete: row?.CanDelete ?? false,
          CanSubmit: row?.CanSubmit ?? false,
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

  function toggleCompanyScope(code: string) {
    setCompanyScope((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function saveCompanyScope() {
    setCompanyScopePending(true);
    setCompanyScopeMsg(null);
    try {
      const res = await fetch(`/api/users/${target.UserID}/company-scope`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([...companyScope]),
      });
      const body = await res.json().catch(() => ({}));
      setCompanyScopeMsg(res.ok ? "บันทึกแล้ว" : body.message || body.error || "บันทึกไม่สำเร็จ");
    } finally {
      setCompanyScopePending(false);
    }
  }

  function toggleEmployeeTypeScope(value: string) {
    setEmployeeTypeScope((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function saveEmployeeTypeScope() {
    setEmployeeTypeScopePending(true);
    setEmployeeTypeScopeMsg(null);
    try {
      const res = await fetch(`/api/users/${target.UserID}/employee-type-scope`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([...employeeTypeScope]),
      });
      const body = await res.json().catch(() => ({}));
      setEmployeeTypeScopeMsg(res.ok ? "บันทึกแล้ว" : body.message || body.error || "บันทึกไม่สำเร็จ");
    } finally {
      setEmployeeTypeScopePending(false);
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

  // Section-level "เลือกทั้งหมด/ล้างทั้งหมด" — sets every applicable
  // action (per actionApplies()) on every row in that ModuleGroup at once,
  // rather than clicking each checkbox individually.
  function setGroupAll(groupMenus: Menu[], value: boolean) {
    setPerms((prev) => {
      const next = new Map(prev);
      for (const m of groupMenus) {
        const current = next.get(m.DocumentType)!;
        const updated = { ...current };
        for (const a of ACTIONS) {
          if (actionApplies(m.DocumentType, a.key)) updated[a.key] = value;
        }
        next.set(m.DocumentType, updated);
      }
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
          canSubmit: p.CanSubmit,
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

  const groupedMenus = new Map<string, Menu[]>();
  for (const m of menus) {
    if (!groupedMenus.has(m.ModuleGroup)) groupedMenus.set(m.ModuleGroup, []);
    groupedMenus.get(m.ModuleGroup)!.push(m);
  }
  const orderedGroups = [...GROUP_ORDER.filter((g) => groupedMenus.has(g)), ...[...groupedMenus.keys()].filter((g) => !GROUP_ORDER.includes(g))];

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
      {isSelf && <ChangePasswordForm userId={target.UserID} />}
      {canSave && !isSelf && (
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

      {/* Company scope checklist */}
      {canSave && (
        <div className="flex flex-col gap-3 rounded border border-gray-200 p-4">
          <h2 className="font-semibold">บริษัทที่ใช้งานได้</h2>
          <p className="text-xs text-gray-500">ไม่เลือกเลย = เห็นข้อมูลของทุกบริษัท — เลือกอย่างน้อย 1 รายการเพื่อจำกัดให้เห็นเฉพาะบริษัทที่เลือก (มีผลกับข้อมูลพนักงานทั่วทั้งระบบ)</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {companies.map((c) => (
              <label key={c.CompanyCode} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={companyScope.has(c.CompanyCode)} onChange={() => toggleCompanyScope(c.CompanyCode)} />
                {c.CompanyName}
              </label>
            ))}
            {companies.length === 0 && <span className="text-sm text-gray-400">ยังไม่มีข้อมูลบริษัท</span>}
          </div>
          <button
            onClick={saveCompanyScope}
            disabled={companyScopePending}
            className="w-fit rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {companyScopePending ? "กำลังบันทึก..." : "บันทึก"}
          </button>
          {companyScopeMsg && <p className="text-sm text-gray-600">{companyScopeMsg}</p>}
        </div>
      )}

      {/* Employee type scope checklist */}
      {canSave && (
        <div className="flex flex-col gap-3 rounded border border-gray-200 p-4">
          <h2 className="font-semibold">ประเภทพนักงานที่ใช้งานได้</h2>
          <p className="text-xs text-gray-500">ไม่เลือกเลย = เห็นข้อมูลพนักงานทุกประเภท (เทียบเท่า &quot;ทั้งหมด&quot;) — เลือกเพื่อจำกัดให้เห็นเฉพาะประเภทที่เลือก</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {EMPLOYEE_TYPE_VALUES.map((v) => (
              <label key={v} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={employeeTypeScope.has(v)} onChange={() => toggleEmployeeTypeScope(v)} />
                {EMPLOYEE_TYPE_LABELS[v]}
              </label>
            ))}
          </div>
          <button
            onClick={saveEmployeeTypeScope}
            disabled={employeeTypeScopePending}
            className="w-fit rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {employeeTypeScopePending ? "กำลังบันทึก..." : "บันทึก"}
          </button>
          {employeeTypeScopeMsg && <p className="text-sm text-gray-600">{employeeTypeScopeMsg}</p>}
        </div>
      )}

      {/* Permissions */}
      {canSave && (
        <div className="flex flex-col gap-3 rounded border border-gray-200 p-4">
          <h2 className="font-semibold">สิทธิ์รายเมนู</h2>
          <p className="text-xs text-gray-500">
            ทุกแถวคือสิทธิ์แบบ &quot;ทุกหน่วยงาน&quot; (SiteCode = NULL) — การกำหนดสิทธิ์แยกรายหน่วยงานยังไม่รองรับผ่านหน้านี้ — ช่องที่เว้นว่างหมายถึงเมนูนั้นไม่มีขั้นตอนนี้
          </p>
          <div className="flex flex-col gap-6">
            {orderedGroups.map((groupKey) => {
              const groupMenus = groupedMenus.get(groupKey)!;
              return (
                <div key={groupKey} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between border-b border-gray-200 pb-1">
                    <h3 className="text-sm font-semibold text-gray-800">{GROUP_LABELS[groupKey] ?? groupKey}</h3>
                    <div className="flex gap-2 text-xs">
                      <button type="button" onClick={() => setGroupAll(groupMenus, true)} className="text-blue-600 hover:underline">
                        เลือกทั้งหมด
                      </button>
                      <button type="button" onClick={() => setGroupAll(groupMenus, false)} className="text-gray-500 hover:underline">
                        ล้างทั้งหมด
                      </button>
                    </div>
                  </div>
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
                        {groupMenus.map((m) => {
                          const p = perms.get(m.DocumentType)!;
                          return (
                            <tr key={m.DocumentType} className="border-b border-gray-100">
                              <td className="py-1 pr-2">
                                <div>{m.MenuNameTH}</div>
                                <div className="text-xs text-gray-400">{m.DocumentType}</div>
                              </td>
                              {ACTIONS.map((a) =>
                                actionApplies(m.DocumentType, a.key) ? (
                                  <td key={a.key} className="px-2 py-1 text-center">
                                    <input type="checkbox" checked={p[a.key]} onChange={() => togglePerm(m.DocumentType, a.key)} />
                                  </td>
                                ) : (
                                  <td key={a.key} className="px-2 py-1 text-center text-gray-300">
                                    —
                                  </td>
                                ),
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
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
