import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { getOrCreateDraftWorksheet, getWorksheetDetail } from "@/lib/worksheet";
import WorksheetView, { type WorksheetData } from "./worksheet-view";

export default async function WorksheetPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; year?: string; month?: string }>;
}) {
  const user = await verifySession();
  if (!user) redirect("/login");
  const sp = await searchParams;

  const [sites, employees, positions] = await Promise.all([
    prisma.mstSite.findMany({
      where: { IsActive: true },
      orderBy: { SiteCode: "asc" },
      select: { SiteCode: true, SiteName: true },
    }),
    // 2026-09-21: "รหัสพนักงานสแปร์" ค้นหาได้จากทะเบียนพนักงาน — เฉพาะสถานะ
    // ปกติ/ทดลองงาน (คนที่ยังทำงานอยู่จริงและยังไม่ได้ลาออก/พักงาน/เลิกจ้าง)
    prisma.mstEmployee.findMany({
      where: { EmployeeStatus: { in: ["ACTIVE", "PROBATION"] } },
      orderBy: { EmpCode: "asc" },
      select: { EmpCode: true, FullName: true },
    }),
    // 2026-09-21: ตำแหน่งที่พนักงานสแปร์มาทำ "สำหรับใบนี้โดยเฉพาะ" — เลือกได้
    // อิสระจากตำแหน่งประจำใน mst_employee เอง
    prisma.refPosition.findMany({
      where: { IsActive: true },
      orderBy: { PositionCode: "asc" },
      select: { PositionCode: true, PositionName: true },
    }),
  ]);

  const now = new Date();
  // 2026-09-21: site/year/month can be pre-selected via query params (used
  // by the "รายการรออนุมัติ" list to link straight to a specific pending
  // worksheet) — falls back to the usual default (user's own site, current
  // month) when absent, exactly as before.
  const requestedSite = sp.site && sites.some((s) => s.SiteCode === sp.site) ? sp.site : null;
  const requestedYear = Number(sp.year);
  const requestedMonth = Number(sp.month);
  const siteCode = requestedSite ?? user.defaultSiteCode ?? sites[0]?.SiteCode ?? "";
  const year = requestedSite && Number.isInteger(requestedYear) ? requestedYear : now.getFullYear();
  const month = requestedSite && Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12 ? requestedMonth : now.getMonth() + 1;

  let initialData: WorksheetData | null = null;
  let initialError: string | null = null;

  if (siteCode) {
    const denied = !(await hasPermission(user, "WORKSHEET", "read", siteCode));
    if (denied) {
      initialError = "ไม่มีสิทธิ์เข้าถึง Worksheet ของหน่วยงานนี้";
    } else {
      const worksheetId = await getOrCreateDraftWorksheet(siteCode, year, month, user.userId);
      const detail = await getWorksheetDetail(worksheetId);
      const [canSave, canApprove] = await Promise.all([
        hasPermission(user, "WORKSHEET", "save", siteCode),
        hasPermission(user, "WORKSHEET", "approve", siteCode),
      ]);
      // Prisma.Decimal (dailyRate/total/PayMultiplier) isn't a plain object
      // React Server Components can serialize across the RSC boundary —
      // round-trip through JSON so Decimal.toJSON() turns it into a string
      // before it reaches the Client Component prop.
      initialData = detail ? JSON.parse(JSON.stringify({ ...detail, canSave, canApprove })) : null;
    }
  }

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">ใบลงเวลาปฏิบัติงานประจำเดือน</h1>

      {sites.length === 0 ? (
        <p className="text-sm text-gray-500">
          ยังไม่มีหน่วยงาน (Site) ในระบบ — ต้องสร้างหน่วยงานอย่างน้อย 1 แห่งก่อนใช้งาน Worksheet
        </p>
      ) : (
        <WorksheetView sites={sites} employees={employees} positions={positions} initialData={initialData} initialError={initialError} />
      )}
    </div>
  );
}
