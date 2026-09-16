import { redirect } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { getOrCreateDraftWorksheet, getWorksheetDetail } from "@/lib/worksheet";
import WorksheetView, { type WorksheetData } from "./worksheet-view";

export default async function WorksheetPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const sites = await prisma.mstSite.findMany({
    where: { IsActive: true },
    orderBy: { SiteCode: "asc" },
    select: { SiteCode: true, SiteName: true },
  });

  const now = new Date();
  const siteCode = user.defaultSiteCode ?? sites[0]?.SiteCode ?? "";
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

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
    <main className="mx-auto max-w-6xl p-8">
      <Link href="/" className="text-sm text-gray-500 hover:underline">
        ← กลับหน้าแรก
      </Link>
      <h1 className="mb-6 mt-2 text-xl font-semibold">ใบลงเวลาปฏิบัติงานประจำเดือน</h1>

      {sites.length === 0 ? (
        <p className="text-sm text-gray-500">
          ยังไม่มีหน่วยงาน (Site) ในระบบ — ต้องสร้างหน่วยงานอย่างน้อย 1 แห่งก่อนใช้งาน Worksheet
        </p>
      ) : (
        <WorksheetView sites={sites} initialData={initialData} initialError={initialError} />
      )}
    </main>
  );
}
