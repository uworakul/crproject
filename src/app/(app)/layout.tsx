import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { REQUEST_PERMISSION_GROUPS } from "@/lib/request";
import Sidebar from "./sidebar";
import LogoutButton from "./logout-button";

// Fallback used whenever ref_company has no row yet, or the first row has no
// ShortName filled in — keeps the brand line non-empty either way.
const DEFAULT_COMPANY_LABEL = "ABC CO., LTD.";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await verifySession();
  if (!user) redirect("/login");

  const [
    canViewSystemConfig,
    canViewUsers,
    canViewAuditLog,
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
    canApproveAnyStock,
    canViewSite,
    canApproveWorksheet,
    canViewPayrollWorkspace,
    canViewLeaveRequest,
    company,
  ] = await Promise.all([
    hasPermission(user, "SYS_CONFIG", "read"),
    hasPermission(user, "USER", "read"),
    hasPermission(user, "PROCESS_LOG", "read"),
    hasPermission(user, "REFERENCE", "read"),
    hasPermission(user, "TAX_RATE", "read"),
    hasPermission(user, "INCOME_DEDUCTION", "read"),
    hasPermission(user, "EMPLOYEE", "read"),
    hasPermission(user, "PERIOD", "read"),
    hasPermission(user, "DRAFT_LIST", "read"),
    Promise.all(REQUEST_PERMISSION_GROUPS.map((g) => hasPermission(user, g.docType, "read"))).then((r) => r.some(Boolean)),
    hasPermission(user, "SUPPLIER", "read"),
    hasPermission(user, "WAREHOUSE", "read"),
    hasPermission(user, "PRODUCT", "read"),
    hasPermission(user, "STOCK_COUNT", "read"),
    hasPermission(user, "STOCK_PURCHASE", "read"),
    hasPermission(user, "STOCK_TRANSFER", "read"),
    hasPermission(user, "STOCK_ISSUE", "read"),
    hasPermission(user, "STOCK_RETURN", "read"),
    Promise.all([
      hasPermission(user, "STOCK_COUNT", "approve"),
      hasPermission(user, "STOCK_PURCHASE", "approve"),
      hasPermission(user, "STOCK_TRANSFER", "approve"),
      hasPermission(user, "STOCK_ISSUE", "approve"),
      hasPermission(user, "STOCK_RETURN", "approve"),
    ]).then((r) => r.some(Boolean)),
    hasPermission(user, "SITE", "read"),
    // No siteCode passed -> matches ANY sys_user_permission row for
    // WORKSHEET+CanApprove (site-specific or SiteCode=NULL) per
    // hasPermission's OR-clause, i.e. "can approve at least one site" — just
    // for the menu-visibility gate; the pending-approval page itself scopes
    // which sites' worksheets actually show.
    hasPermission(user, "WORKSHEET", "approve"),
    Promise.all([
      hasPermission(user, "PAYROLL_TRANSACTION", "read"),
      hasPermission(user, "PAYROLL_CALCULATE", "save"),
      hasPermission(user, "PAYROLL_LOCK", "read"),
      hasPermission(user, "PAYROLL_REPORT", "read"),
    ]).then((r) => r.some(Boolean)),
    hasPermission(user, "LEAVE_REQUEST", "read"),
    prisma.refCompany.findFirst({ orderBy: { CompanyCode: "asc" } }),
  ]);
  const canViewInventoryMaster = canViewSupplier || canViewWarehouse || canViewProduct;
  const canViewTransactions = canViewCount || canViewPurchase || canViewTransfer || canViewIssue || canViewReturn || canViewInventoryMaster;
  const companyShortName = company?.ShortName || DEFAULT_COMPANY_LABEL;

  const groups = [
    {
      // 2026-09-21: new top-most menu — singleton system default/startup
      // settings (sys_config), unrelated to the original 9-module scope.
      label: "System Configuration",
      icon: "settings" as const,
      items: canViewSystemConfig ? [{ href: "/system-config", label: "System Configuration" }] : [],
    },
    {
      label: "ผู้ใช้งานและสิทธิ์",
      icon: "users" as const,
      items: [
        ...(canViewUsers ? [{ href: "/users", label: "ผู้ใช้งาน" }] : []),
        ...(canViewAuditLog ? [{ href: "/audit-log", label: "Audit Log" }] : []),
      ],
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
        ...(canViewAnyRequest ? [{ href: "/requests", label: "เบิกล่วงหน้า/เงินกู้/ค่าอบรม" }] : []),
        ...(canViewDraftList ? [{ href: "/requests/draft-list", label: "รายการรออนุมัติ" }] : []),
      ],
    },
    {
      label: "สินค้าคงคลัง/เครื่องแบบ",
      icon: "inventory" as const,
      items: [
        ...(canViewInventoryMaster ? [{ href: "/inventory", label: "ข้อมูลหลัก" }] : []),
        ...(canViewTransactions ? [{ href: "/inventory/transactions", label: "บันทึกรายการสต๊อก" }] : []),
        ...(canApproveAnyStock ? [{ href: "/inventory/stock-count-approvals", label: "รายการรออนุมัติ" }] : []),
      ],
    },
    {
      label: "การลา",
      icon: "leave" as const,
      // /leave/balances menu removed 2026-09-21 — Entitled is now computed
      // live from mst_leave_type (+ mst_leave_tenure_tier for BasedOnTenure
      // types) instead of a per-employee manually-set value, so there's
      // nothing left for that screen to configure. The page/API route are
      // still there (unlinked), same "disconnect but don't delete" precedent
      // used elsewhere in this project.
      items: [...(canViewLeaveRequest ? [{ href: "/leave", label: "บันทึกใบลา" }] : [])],
    },
    {
      label: "ใบลงเวลาปฏิบัติงาน",
      icon: "worksheet" as const,
      items: [
        ...(canViewSite ? [{ href: "/payroll/sites", label: "หน่วยงาน (Site)" }] : []),
        { href: "/worksheet", label: "Worksheet" },
        ...(canApproveWorksheet ? [{ href: "/worksheet/pending-approval", label: "รายการรออนุมัติ" }] : []),
      ],
    },
    {
      // Renamed from "คำนวณและจ่ายเงินเดือน" 2026-09-21, split from the
      // single "ประมวลผลเงินเดือน" page into 3 screens — the old page
      // (/payroll/period) still works if visited directly (unlinked, same
      // "disconnect but don't delete" precedent used elsewhere), kept as a
      // fallback bundling Transaction grid + Calculate + Lock + Closing +
      // Report all in one place.
      label: "การประมวลผล",
      icon: "payroll" as const,
      items: [
        ...(canViewPayrollWorkspace ? [{ href: "/payroll/transactions", label: "รายการประจำงวด" }] : []),
        ...(canViewPayrollWorkspace ? [{ href: "/payroll/calculate", label: "คำนวณเงินได้ประจำงวด" }] : []),
        ...(canViewPayrollWorkspace ? [{ href: "/payroll/closing", label: "ปิดสิ้นงวด" }] : []),
      ],
    },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-screen">
      <Sidebar groups={groups} companyShortName={companyShortName} />
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
