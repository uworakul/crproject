import { redirect } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";

export default async function EmployeesPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "EMPLOYEE", "read");
  if (!canRead) redirect("/");

  const [employees, canCreate] = await Promise.all([
    prisma.mstEmployee.findMany({
      select: {
        EmpCode: true,
        FullName: true,
        EmployeeStatus: true,
        EmployeeType: true,
        Department: { select: { DeptName: true } },
        Position: { select: { PositionName: true } },
        Site: { select: { SiteName: true } },
        IsActive: true,
      },
      orderBy: { EmpCode: "asc" },
    }),
    hasPermission(user, "EMPLOYEE", "save"),
  ]);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">ทะเบียนพนักงาน</h1>
        {canCreate && (
          <Link href="/employees/new" className="rounded-md bg-gray-900 px-3.5 py-2 text-sm text-white hover:bg-gray-700">
            + เพิ่มพนักงาน
          </Link>
        )}
      </div>

      <table className="w-full border-collapse overflow-hidden rounded-lg border border-gray-200 bg-white text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-3 py-2 font-medium">รหัส</th>
            <th className="px-3 py-2 font-medium">ชื่อ-นามสกุล</th>
            <th className="px-3 py-2 font-medium">แผนก</th>
            <th className="px-3 py-2 font-medium">ตำแหน่ง</th>
            <th className="px-3 py-2 font-medium">หน่วยงาน</th>
            <th className="px-3 py-2 font-medium">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => (
            <tr key={e.EmpCode} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2">
                <Link href={`/employees/${e.EmpCode}`} className="text-gray-900 hover:underline">
                  {e.EmpCode}
                </Link>
              </td>
              <td className="px-3 py-2">{e.FullName}</td>
              <td className="px-3 py-2 text-gray-500">{e.Department?.DeptName ?? "-"}</td>
              <td className="px-3 py-2 text-gray-500">{e.Position?.PositionName ?? "-"}</td>
              <td className="px-3 py-2 text-gray-500">{e.Site?.SiteName ?? "-"}</td>
              <td className="px-3 py-2">
                {e.EmployeeStatus === "RESIGNED" ? (
                  <span className="text-gray-400">ลาออกแล้ว</span>
                ) : e.IsActive ? (
                  <span className="text-green-600">ทำงานอยู่</span>
                ) : (
                  <span className="text-red-500">ระงับ</span>
                )}
              </td>
            </tr>
          ))}
          {employees.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                ยังไม่มีพนักงาน
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
