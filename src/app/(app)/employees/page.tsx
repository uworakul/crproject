import { redirect } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import EmployeesTable from "./employees-table";

export default async function EmployeesPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "EMPLOYEE", "read");
  if (!canRead) redirect("/");

  const [employeesRaw, departments, sites, canCreate, canDelete] = await Promise.all([
    prisma.mstEmployee.findMany({
      select: {
        EmpCode: true,
        FullName: true,
        EmployeeStatus: true,
        EmployeeType: true,
        StartDate: true,
        ResignDate: true,
        DeptCode: true,
        Department: { select: { DeptName: true } },
        Position: { select: { PositionName: true } },
        DefaultSiteCode: true,
        Site: { select: { SiteName: true } },
        IsActive: true,
      },
      orderBy: { EmpCode: "asc" },
    }),
    prisma.refDepartment.findMany({ where: { IsActive: true }, orderBy: { DeptCode: "asc" } }),
    prisma.mstSite.findMany({ where: { IsActive: true }, orderBy: { SiteCode: "asc" } }),
    hasPermission(user, "EMPLOYEE", "save"),
    hasPermission(user, "EMPLOYEE", "delete"),
  ]);

  const employees = employeesRaw.map((e) => ({
    EmpCode: e.EmpCode,
    FullName: e.FullName,
    EmployeeStatus: e.EmployeeStatus,
    EmployeeType: e.EmployeeType,
    StartDate: e.StartDate,
    ResignDate: e.ResignDate,
    DeptCode: e.DeptCode,
    DeptName: e.Department?.DeptName ?? null,
    PositionName: e.Position?.PositionName ?? null,
    SiteCode: e.DefaultSiteCode,
    SiteName: e.Site?.SiteName ?? null,
    IsActive: e.IsActive,
  }));

  return (
    <div className="w-full px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">ทะเบียนพนักงาน</h1>
        {canCreate && (
          <Link href="/employees/new" className="rounded-md bg-gray-900 px-3.5 py-2 text-sm text-white hover:bg-gray-700">
            + เพิ่มพนักงาน
          </Link>
        )}
      </div>

      <EmployeesTable employees={employees} departments={departments} sites={sites} canDelete={canDelete} />
    </div>
  );
}
