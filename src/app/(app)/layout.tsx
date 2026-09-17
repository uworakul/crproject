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
  ] = await Promise.all([
    hasPermission(user, "USER", "read"),
    hasPermission(user, "REFERENCE", "read"),
    hasPermission(user, "TAX_RATE", "read"),
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
  ]);
  const canViewInventoryMaster = canViewSupplier || canViewWarehouse || canViewProduct;

  const groups = [
    {
      label: "ผู้ใช้งานและสิทธิ์",
      items: canViewUsers ? [{ href: "/users", label: "ผู้ใช้งาน" }] : [],
    },
    {
      label: "ตั้งค่าระบบ/รหัสอ้างอิง",
      items: [
        ...(canViewPeriod ? [{ href: "/periods", label: "งวดจ่ายเงินเดือน" }] : []),
        ...(canViewReference ? [{ href: "/reference", label: "รหัสอ้างอิง" }] : []),
        ...(canViewTax ? [{ href: "/reference/tax", label: "อัตราภาษี/ลดหย่อน" }] : []),
      ],
    },
    {
      label: "ข้อมูลหลักพนักงาน",
      items: canViewEmployees ? [{ href: "/employees", label: "ทะเบียนพนักงาน" }] : [],
    },
    {
      label: "การขออนุมัติ",
      items: [
        ...(canViewAnyRequest ? [{ href: "/requests", label: "คำขอเบิก/กู้/อบรม" }] : []),
        ...(canViewDraftList ? [{ href: "/requests/draft-list", label: "รายการรออนุมัติ" }] : []),
      ],
    },
    {
      label: "สินค้าคงคลัง/เครื่องแบบ",
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
      items: [{ href: "/worksheet", label: "Worksheet" }],
    },
    {
      label: "คำนวณและจ่ายเงินเดือน",
      items: [
        ...(canViewSite ? [{ href: "/payroll/sites", label: "หน่วยงาน (Site)" }] : []),
        ...(canViewPayrollWorkspace ? [{ href: "/payroll/period", label: "ประมวลผลเงินเดือน" }] : []),
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
