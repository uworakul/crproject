import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import UserEditForm from "./user-edit-form";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const currentUser = await verifySession();
  if (!currentUser) redirect("/login");

  const canRead = await hasPermission(currentUser, "USER", "read");
  if (!canRead) redirect("/");

  const { userId } = await params;

  const [target, menus, sites, otherUsers, canSave, companies, companyScopeRaw, employeeTypeScopeRaw] = await Promise.all([
    prisma.sysUser.findUnique({
      where: { UserID: userId },
      select: {
        UserID: true,
        DisplayName: true,
        Email: true,
        Role: true,
        DefaultSiteCode: true,
        IsActive: true,
        Permissions: {
          select: { DocumentType: true, SiteCode: true, CanRead: true, CanSave: true, CanDelete: true, CanSubmit: true, CanApprove: true },
        },
      },
    }),
    prisma.sysMenu.findMany({ where: { IsActive: true }, orderBy: [{ ModuleGroup: "asc" }, { DocumentType: "asc" }] }),
    // select-limited (2026-09-29 fix) — mst_site now also carries
    // MonthlyServiceFee (a Prisma Decimal), which can't cross the Server->
    // Client Component boundary un-serialized; UserEditForm only ever reads
    // SiteCode/SiteName for the "หน่วยงานหลัก" dropdown anyway.
    prisma.mstSite.findMany({ where: { IsActive: true }, orderBy: { SiteCode: "asc" }, select: { SiteCode: true, SiteName: true } }),
    prisma.sysUser.findMany({
      where: { UserID: { not: userId } },
      select: { UserID: true, DisplayName: true },
      orderBy: { UserID: "asc" },
    }),
    hasPermission(currentUser, "USER", "save"),
    prisma.refCompany.findMany({ orderBy: { CompanyCode: "asc" }, select: { CompanyCode: true, CompanyName: true } }),
    prisma.sysUserCompany.findMany({ where: { UserID: userId }, select: { CompanyCode: true } }),
    prisma.sysUserEmployeeType.findMany({ where: { UserID: userId }, select: { EmployeeType: true } }),
  ]);

  if (!target) notFound();

  return (
    <div className="w-full px-6 py-8">
      <Link href="/users" className="text-sm text-gray-500 hover:underline">
        ← กลับรายการผู้ใช้งาน
      </Link>
      <h1 className="mb-6 mt-2 text-lg font-semibold text-gray-900">
        ผู้ใช้งาน: {target.UserID} — {target.DisplayName}
      </h1>

      <UserEditForm
        target={target}
        menus={menus}
        sites={sites}
        otherUsers={otherUsers}
        canSave={canSave}
        isSelf={currentUser.userId === target.UserID}
        companies={companies}
        initialCompanyScope={companyScopeRaw.map((r) => r.CompanyCode)}
        initialEmployeeTypeScope={employeeTypeScopeRaw.map((r) => r.EmployeeType)}
      />
    </div>
  );
}
