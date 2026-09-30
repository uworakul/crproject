"use client";

import { useRef, useState } from "react";

interface Config {
  RegistrationCode: string | null;
  HasAccessKey: boolean; // the Access Key itself is never sent to the browser
  PassChecking: boolean;
  ContactPerson: string | null;
  Tel: string | null;
}

const inputCls = "rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100";

// Singleton settings form (มีแต่บันทึก 1 record เสมอ) — same "load into local
// state, PUT the whole form on save" pattern as the employee master tabs
// (e.g. income-tab.tsx), just with no list/table and no key to route on.
//
// "Pass Checking" is only revealed once every field is filled AND the server
// confirms Registration Code == the database name and Access Key is an
// accepted key (POST /api/system-config/verify — the browser never learns the
// accepted keys). The Access Key field is a write-only password box: it
// always starts blank, can't be copied/cut/dragged, and is never sent back.
export default function SystemConfigForm({ config, canSave }: { config: Config; canSave: boolean }) {
  const [form, setForm] = useState({
    registrationCode: config.RegistrationCode ?? "",
    accessKey: "",
    passChecking: config.PassChecking,
    contactPerson: config.ContactPerson ?? "",
    tel: config.Tel ?? "",
  });
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const verifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verifySeq = useRef(0);

  const allFilled = form.registrationCode.trim() !== "" && form.accessKey !== "" && form.contactPerson.trim() !== "" && form.tel.trim() !== "";
  const showPassChecking = allFilled && verified;

  // Called from the change handlers (not an effect): debounces, then asks the
  // server; a sequence number drops answers that arrive out of order.
  function scheduleVerify(next: typeof form) {
    if (verifyTimer.current) clearTimeout(verifyTimer.current);
    const filled = next.registrationCode.trim() !== "" && next.accessKey !== "" && next.contactPerson.trim() !== "" && next.tel.trim() !== "";
    if (!filled) {
      verifySeq.current++;
      setVerified(false);
      return;
    }
    const seq = ++verifySeq.current;
    verifyTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/system-config/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registrationCode: next.registrationCode, accessKey: next.accessKey }),
        });
        const body = await res.json().catch(() => ({}));
        if (seq === verifySeq.current) setVerified(res.ok && body.valid === true);
      } catch {
        if (seq === verifySeq.current) setVerified(false);
      }
    }, 400);
  }

  function update(patch: Partial<typeof form>) {
    const next = { ...form, ...patch };
    setForm(next);
    scheduleVerify(next);
  }

  async function save() {
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/system-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // passChecking is only sent while its checkbox is actually shown; a
        // blank accessKey means "leave the stored one as is".
        body: JSON.stringify({
          registrationCode: form.registrationCode,
          accessKey: form.accessKey,
          contactPerson: form.contactPerson,
          tel: form.tel,
          ...(showPassChecking ? { passChecking: form.passChecking } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      setMessage(res.ok ? "บันทึกแล้ว" : body.message || body.error);
      if (res.ok) {
        setForm((f) => ({ ...f, accessKey: "" }));
        setVerified(false);
        verifySeq.current++;
        // A full reload, not just router.refresh(): saving can flip the
        // system-wide Pass Checking lock, which changes the whole sidebar.
        window.location.reload();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6 rounded-lg border border-gray-200 bg-white p-6">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Registration Code">
          <input disabled={!canSave} value={form.registrationCode} onChange={(e) => update({ registrationCode: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Access Key">
          <input
            disabled={!canSave}
            type="password"
            autoComplete="new-password"
            value={form.accessKey}
            placeholder={config.HasAccessKey ? "•••••••• (ตั้งค่าแล้ว)" : ""}
            onChange={(e) => update({ accessKey: e.target.value })}
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
            onContextMenu={(e) => e.preventDefault()}
            className={inputCls}
          />
        </Field>
        <Field label="Contact Person">
          <input disabled={!canSave} value={form.contactPerson} onChange={(e) => update({ contactPerson: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Tel">
          <input disabled={!canSave} value={form.tel} onChange={(e) => update({ tel: e.target.value })} className={inputCls} />
        </Field>
        {showPassChecking && (
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
        )}
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
