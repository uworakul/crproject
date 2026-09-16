import { redirect } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";

export default async function UsersPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const allowed = await hasPermission(user, "USER", "read");
  if (!allowed) redirect("/");

  const users = await prisma.sysUser.findMany({
    select: { UserID: true, DisplayName: true, Role: true, DefaultSiteCode: true, IsActive: true, LastLoginDate: true },
    orderBy: { UserID: "asc" },
  });

  const canCreate = await hasPermission(user, "USER", "save");

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">ผู้ใช้งาน</h1>
          <Link href="/" className="text-sm text-gray-500 hover:underline">
            ← กลับหน้าแรก
          </Link>
        </div>
        {canCreate && (
          <Link href="/users/new" className="rounded bg-blue-600 px-4 py-2 text-sm text-white">
            + สร้างผู้ใช้งาน
          </Link>
        )}
      </div>

      <table className="w-full border-collapse overflow-hidden rounded border border-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-gray-600">
          <tr>
            <th className="px-3 py-2">รหัสผู้ใช้งาน</th>
            <th className="px-3 py-2">ชื่อ</th>
            <th className="px-3 py-2">สิทธิ์ (Role)</th>
            <th className="px-3 py-2">หน่วยงานหลัก</th>
            <th className="px-3 py-2">สถานะ</th>
            <th className="px-3 py-2">เข้าสู่ระบบล่าสุด</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.UserID} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2">
                <Link href={`/users/${u.UserID}`} className="text-blue-600 hover:underline">
                  {u.UserID}
                </Link>
              </td>
              <td className="px-3 py-2">{u.DisplayName}</td>
              <td className="px-3 py-2">{u.Role}</td>
              <td className="px-3 py-2">{u.DefaultSiteCode ?? "-"}</td>
              <td className="px-3 py-2">
                {u.IsActive ? (
                  <span className="text-green-600">ใช้งาน</span>
                ) : (
                  <span className="text-red-500">ระงับ</span>
                )}
              </td>
              <td className="px-3 py-2 text-gray-500">
                {u.LastLoginDate ? new Date(u.LastLoginDate).toLocaleString("th-TH") : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
