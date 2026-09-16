import { redirect } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import LogoutButton from "./logout-button";

export default async function Home() {
  // proxy.ts already redirects optimistically; this is the secure (DB-checked)
  // check that must happen close to the actual page per the Next.js auth guide.
  const user = await verifySession();
  if (!user) {
    redirect("/login");
  }

  const canViewUsers = await hasPermission(user, "USER", "read");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">ABC CO., LTD. — HR &amp; Payroll</h1>
      <p className="text-gray-500">
        สวัสดี {user.displayName} ({user.role})
      </p>
      <Link href="/worksheet" className="text-sm text-blue-600 hover:underline">
        ใบลงเวลาปฏิบัติงานประจำเดือน (Worksheet)
      </Link>
      {canViewUsers && (
        <Link href="/users" className="text-sm text-blue-600 hover:underline">
          จัดการผู้ใช้งาน
        </Link>
      )}
      <LogoutButton />
    </main>
  );
}
