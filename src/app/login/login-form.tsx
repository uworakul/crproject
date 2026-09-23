"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm({ companyShortName }: { companyShortName: string }) {
  const router = useRouter();
  const [tenantCode, setTenantCode] = useState("");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantCode, userId, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          body.error === "TENANT_NOT_FOUND"
            ? "ไม่พบรหัสลูกค้านี้ในระบบ"
            : body.error === "ACCOUNT_DISABLED"
              ? "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ"
              : "รหัสผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง",
        );
        return;
      }

      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-900 text-sm font-semibold text-white">
            CR
          </div>
          <div className="text-lg font-semibold tracking-tight text-gray-900">CRPAYROLL</div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tenantCode" className="text-sm text-gray-700">
              รหัสลูกค้า
            </label>
            <input
              id="tenantCode"
              name="tenantCode"
              autoComplete="off"
              placeholder="เช่น 001"
              value={tenantCode}
              onChange={(e) => setTenantCode(e.target.value)}
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="userId" className="text-sm text-gray-700">
              รหัสผู้ใช้งาน
            </label>
            <input
              id="userId"
              name="userId"
              autoComplete="username"
              placeholder="เช่น admin"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm text-gray-700">
              รหัสผ่าน
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm outline-none focus:border-gray-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-xs text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? "ซ่อน" : "แสดง"}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {pending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">{companyShortName}</p>
      </div>
    </main>
  );
}
