"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ROLE_VALUES } from "@/lib/validation";

interface Site {
  SiteCode: string;
  SiteName: string;
}

export default function NewUserPage() {
  const router = useRouter();
  const [sites, setSites] = useState<Site[]>([]);
  const [form, setForm] = useState({
    userId: "",
    password: "",
    displayName: "",
    email: "",
    role: "" as string,
    defaultSiteCode: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then(setSites)
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          defaultSiteCode: form.defaultSiteCode || null,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || body.error || "สร้างผู้ใช้งานไม่สำเร็จ");
        return;
      }

      router.push(`/users/${form.userId}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg p-8">
      <Link href="/users" className="text-sm text-gray-500 hover:underline">
        ← กลับรายการผู้ใช้งาน
      </Link>
      <h1 className="mb-6 mt-2 text-lg font-semibold text-gray-900">สร้างผู้ใช้งานใหม่</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="รหัสผู้ใช้งาน (Login Name)">
          <input
            required
            value={form.userId}
            onChange={(e) => setForm({ ...form, userId: e.target.value })}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </Field>
        <Field label="รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)">
          <input
            required
            type="password"
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </Field>
        <Field label="ชื่อที่แสดง">
          <input
            required
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </Field>
        <Field label="อีเมล (ถ้ามี)">
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </Field>
        <Field label="สิทธิ์ (Role)">
          <select
            required
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="rounded border border-gray-300 px-3 py-2"
          >
            <option value="" disabled>
              เลือก Role
            </option>
            {ROLE_VALUES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="หน่วยงานหลัก (ถ้ามี)">
          <select
            value={form.defaultSiteCode}
            onChange={(e) => setForm({ ...form, defaultSiteCode: e.target.value })}
            className="rounded border border-gray-300 px-3 py-2"
          >
            <option value="">- ไม่ระบุ -</option>
            {sites.map((s) => (
              <option key={s.SiteCode} value={s.SiteCode}>
                {s.SiteName}
              </option>
            ))}
          </select>
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก..." : "สร้างผู้ใช้งาน"}
        </button>
      </form>
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
