import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { REQUEST_TYPE_VALUES, REQUEST_TYPE_DOCTYPE } from "@/lib/request";
import Sidebar from "./sidebar";
import LogoutButton from "./logout-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await verifySession();
  if (!user) redirect("/login");

  const [
    canViewUsers,
    canViewReference,
    canViewTax,
    canViewIncomeDeduction,
    canViewEmployees,
    canViewPeriod,
    canViewDraftList,
    canViewAnyRequest,
    canViewSupplier,
    canViewWarehouse,
    canViewProduct,
    canViewCount,
    canViewPurchase,
    canViewTransfer,
    canViewIssue,
    canViewReturn,
    canViewSite,
    canViewPayrollWorkspace,
    canViewLeaveRequest,
    canViewLeaveReport,
  ] = await Promise.all([
    hasPermission(user, "USER", "read"),
    hasPermission(user, "REFERENCE", "read"),
    hasPermission(user, "TAX_RATE", "read"),
    hasPermission(user, "INCOME_DEDUCTION", "read"),
    hasPermission(user, "EMPLOYEE", "read"),
    hasPermission(user, "PERIOD", "read"),
    hasPermission(user, "DRAFT_LIST", "read"),
    Promise.all(REQUEST_TYPE_VALUES.map((t) => hasPermission(user, REQUEST_TYPE_DOCTYPE[t], "read"))).then((r) => r.some(Boolean)),
    hasPermission(user, "SUPPLIER", "read"),
    hasPermission(user, "WAREHOUSE", "read"),
    hasPermission(user, "PRODUCT", "read"),
    hasPermission(user, "STOCK_COUNT", "read"),
    hasPermission(user, "STOCK_PURCHASE", "read"),
    hasPermission(user, "STOCK_TRANSFER", "read"),
    hasPermission(user, "STOCK_ISSUE", "read"),
    hasPermission(user, "STOCK_RETURN", "read"),
    hasPermission(user, "SITE", "read"),
    Promise.all([
      hasPermission(user, "PAYROLL_TRANSACTION", "read"),
      hasPermission(user, "PAYROLL_CALCULATE", "save"),
      hasPermission(user, "PAYROLL_LOCK", "read"),
      hasPermission(user, "PAYROLL_REPORT", "read"),
    ]).then((r) => r.some(Boolean)),
    hasPermission(user, "LEAVE_REQUEST", "read"),
    hasPermission(user, "LEAVE_REPORT", "read"),
  ]);
  const canViewInventoryMaster = canViewSupplier || canViewWarehouse || canViewProduct;

  const groups = [
    {
      label: "ผู้ใช้งานและสิทธิ์",
      icon: "users" as const,
      items: canViewUsers ? [{ href: "/users", label: "ผู้ใช้งาน" }] : [],
    },
    {
      label: "ตั้งค่าระบบ/รหัสอ้างอิง",
      icon: "settings" as const,
      items: [
        ...(canViewReference ? [{ href: "/reference", label: "รหัสอ้างอิงหลัก" }] : []),
        ...(canViewReference ? [{ href: "/leave/types", label: "ประเภทและสิทธิการลา" }] : []),
        ...(canViewTax ? [{ href: "/reference/tax", label: "ภาษี/ค่าลดหย่อน/กองทุนฯ" }] : []),
        ...(canViewIncomeDeduction ? [{ href: "/reference/income-deduction", label: "รายได้และรายการหัก" }] : []),
        ...(canViewPeriod ? [{ href: "/periods", label: "งวดการจ่าย" }] : []),
      ],
    },
    {
      label: "ข้อมูลหลักพนักงาน",
      icon: "employee" as const,
      items: canViewEmployees ? [{ href: "/employees", label: "ทะเบียนพนักงาน" }] : [],
    },
    {
      label: "การขออนุมัติ",
      icon: "approve" as const,
      items: [
        ...(canViewAnyRequest ? [{ href: "/requests", label: "คำขอเบิก/กู้/อบรม" }] : []),
        ...(canViewDraftList ? [{ href: "/requests/draft-list", label: "รายการรออนุมัติ" }] : []),
      ],
    },
    {
      label: "สินค้าคงคลัง/เครื่องแบบ",
      icon: "inventory" as const,
      items: [
        ...(canViewInventoryMaster ? [{ href: "/inventory", label: "ข้อมูลหลัก (ผู้ขาย/คลัง/สินค้า)" }] : []),
        ...(canViewCount ? [{ href: "/inventory/count", label: "ตรวจนับสต๊อก" }] : []),
        ...(canViewPurchase ? [{ href: "/inventory/purchase", label: "ซื้อสินค้า" }] : []),
        ...(canViewTransfer ? [{ href: "/inventory/transfer", label: "โอนสินค้าระหว่างคลัง" }] : []),
        ...(canViewIssue ? [{ href: "/inventory/issue", label: "จำหน่ายสินค้า" }] : []),
        ...(canViewReturn ? [{ href: "/inventory/return", label: "คืนสินค้า" }] : []),
      ],
    },
    {
      label: "ใบลงเวลาปฏิบัติงาน",
      icon: "worksheet" as const,
      items: [
        ...(canViewSite ? [{ href: "/payroll/sites", label: "หน่วยงาน (Site)" }] : []),
        { href: "/worksheet", label: "Worksheet" },
      ],
    },
    {
      label: "คำนวณและจ่ายเงินเดือน",
      icon: "payroll" as const,
      items: [
        ...(canViewPayrollWorkspace ? [{ href: "/payroll/period", label: "ประมวลผลเงินเดือน" }] : []),
      ],
    },
    {
      label: "การลา",
      icon: "leave" as const,
      items: [
        ...(canViewLeaveRequest ? [{ href: "/leave", label: "ใบลา" }] : []),
        ...(canViewLeaveRequest ? [{ href: "/leave/balances", label: "สิทธิวันลาพนักงาน" }] : []),
        ...(canViewLeaveReport ? [{ href: "/leave/report", label: "รายงานประวัติการลา" }] : []),
      ],
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
