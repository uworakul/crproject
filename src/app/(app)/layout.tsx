import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import Sidebar from "./sidebar";
import LogoutButton from "./logout-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await verifySession();
  if (!user) redirect("/login");

  const [canViewUsers, canViewReference, canViewTax, canViewEmployees] = await Promise.all([
    hasPermission(user, "USER", "read"),
    hasPermission(user, "REFERENCE", "read"),
    hasPermission(user, "TAX_RATE", "read"),
    hasPermission(user, "EMPLOYEE", "read"),
  ]);

  const groups = [
    {
      label: "ผู้ใช้งานและสิทธิ์",
      items: canViewUsers ? [{ href: "/users", label: "ผู้ใช้งาน" }] : [],
    },
    {
      label: "ตั้งค่าระบบ/รหัสอ้างอิง",
      items: [
        ...(canViewReference ? [{ href: "/reference", label: "รหัสอ้างอิง" }] : []),
        ...(canViewTax ? [{ href: "/reference/tax", label: "อัตราภาษี/ลดหย่อน" }] : []),
      ],
    },
    {
      label: "ข้อมูลหลักพนักงาน",
      items: canViewEmployees ? [{ href: "/employees", label: "ทะเบียนพนักงาน" }] : [],
    },
    {
      label: "ใบลงเวลาปฏิบัติงาน",
      items: [{ href: "/worksheet", label: "Worksheet" }],
    },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-screen">
      <Sidebar groups={groups} />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-4 border-b border-gray-200 bg-white px-6 py-3">
          <span className="text-sm text-gray-600">
            {user.displayName} <span className="text-gray-400">· {user.role}</span>
          </span>
          <LogoutButton />
        </header>
        <main className="flex-1 bg-gray-50">{children}</main>
      </div>
    </div>
  );
}
