"use client";

import { useRef, useState } from "react";

export default function ChangePasswordForm({ userId }: { userId: string }) {
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const confirmPassword = String(data.get("confirmPassword") ?? "");
    setError("");
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError("ยืนยันรหัสผ่านใหม่ไม่ตรงกัน");
      return;
    }
    if (currentPassword === newPassword) {
      setError("รหัสผ่านใหม่ต้องแตกต่างจากรหัสผ่านปัจจุบัน");
      return;
    }
    submitting.current = true;
    setPending(true);
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(userId)}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(response.status === 401 ? "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" : result.message || "เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองอีกครั้ง");
        return;
      }
      form.reset();
      setSuccess(true);
    } catch {
      setError("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-lg rounded border border-gray-200 bg-white p-6">
      <fieldset disabled={pending} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          รหัสผ่านปัจจุบัน
          <input name="currentPassword" type="password" autoComplete="current-password" required className="rounded border border-gray-300 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          รหัสผ่านใหม่
          <input name="newPassword" type="password" autoComplete="new-password" required minLength={8} aria-describedby="password-hint" className="rounded border border-gray-300 px-3 py-2" />
          <span id="password-hint" className="text-xs text-gray-500">อย่างน้อย 8 ตัวอักษร และแตกต่างจากรหัสผ่านปัจจุบัน</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          ยืนยันรหัสผ่านใหม่
          <input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} className="rounded border border-gray-300 px-3 py-2" />
        </label>
        <button type="submit" className="w-fit rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          {pending ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
        </button>
      </fieldset>
      {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p role="status" className="mt-4 text-sm text-green-700">เปลี่ยนรหัสผ่านเรียบร้อยแล้ว</p>}
    </form>
  );
}
