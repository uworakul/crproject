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

  const [target, menus, sites, otherUsers, canSave] = await Promise.all([
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
          select: { DocumentType: true, SiteCode: true, CanRead: true, CanSave: true, CanDelete: true, CanApprove: true },
        },
      },
    }),
    prisma.sysMenu.findMany({ where: { IsActive: true }, orderBy: [{ ModuleGroup: "asc" }, { DocumentType: "asc" }] }),
    prisma.mstSite.findMany({ where: { IsActive: true }, orderBy: { SiteCode: "asc" } }),
    prisma.sysUser.findMany({
      where: { UserID: { not: userId } },
      select: { UserID: true, DisplayName: true },
      orderBy: { UserID: "asc" },
    }),
    hasPermission(currentUser, "USER", "save"),
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
      />
    </div>
  );
}
