"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Config {
  RegistrationCode: string | null;
  AccessKey: string | null;
  PassChecking: boolean;
  ContactPerson: string | null;
  Tel: string | null;
  FileFolder: string | null;
}

const inputCls = "rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100";

// Singleton settings form (มีแต่บันทึก 1 record เสมอ) — same "load into local
// state, PUT the whole form on save" pattern as the employee master tabs
// (e.g. income-tab.tsx), just with no list/table and no key to route on.
export default function SystemConfigForm({ config, canSave }: { config: Config; canSave: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({
    registrationCode: config.RegistrationCode ?? "",
    accessKey: config.AccessKey ?? "",
    passChecking: config.PassChecking,
    contactPerson: config.ContactPerson ?? "",
    tel: config.Tel ?? "",
    fileFolder: config.FileFolder ?? "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/system-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      setMessage(res.ok ? "บันทึกแล้ว" : body.message || body.error);
      if (res.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6 rounded-lg border border-gray-200 bg-white p-6">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Registration Code">
          <input disabled={!canSave} value={form.registrationCode} onChange={(e) => setForm({ ...form, registrationCode: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Access Key">
          <input disabled={!canSave} value={form.accessKey} onChange={(e) => setForm({ ...form, accessKey: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Contact Person">
          <input disabled={!canSave} value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Tel">
          <input disabled={!canSave} value={form.tel} onChange={(e) => setForm({ ...form, tel: e.target.value })} className={inputCls} />
        </Field>
        <Field label="File Folder">
          <input disabled={!canSave} value={form.fileFolder} onChange={(e) => setForm({ ...form, fileFolder: e.target.value })} className={inputCls} />
        </Field>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            disabled={!canSave}
            type="checkbox"
            checked={form.passChecking}
            onChange={(e) => setForm({ ...form, passChecking: e.target.checked })}
            className="h-4 w-4"
          />
          <span className="text-gray-600">Pass Checking</span>
        </label>
      </div>

      {canSave && (
        <div>
          <button onClick={save} disabled={pending} className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
            {pending ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      )}

      {message && <p className="text-sm text-gray-600">{message}</p>}
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
