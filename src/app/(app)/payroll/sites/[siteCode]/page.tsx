import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import SitePositionsView from "./site-positions-view";

export default async function SitePositionsPage({ params }: { params: Promise<{ siteCode: string }> }) {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "SITE", "read");
  if (!canRead) redirect("/");

  const { siteCode } = await params;

  const [canSave, canDelete, site, positionRowsRaw, positions, incomeTypes] = await Promise.all([
    hasPermission(user, "SITE", "save"),
    hasPermission(user, "SITE", "delete"),
    prisma.mstSite.findUnique({ where: { SiteCode: siteCode } }),
    prisma.mstSitePosition.findMany({
      where: { SiteCode: siteCode },
      include: { Position: { select: { PositionName: true } }, IncomeRows: { include: { IncomeType: { select: { IncomeName: true } } }, orderBy: { IncomeCode: "asc" } } },
      orderBy: { PositionCode: "asc" },
    }),
    prisma.refPosition.findMany({ where: { IsActive: true }, orderBy: { PositionCode: "asc" }, select: { PositionCode: true, PositionName: true } }),
    prisma.refIncomeType.findMany({ orderBy: { IncomeCode: "asc" }, select: { IncomeCode: true, IncomeName: true } }),
  ]);

  if (!site) notFound();

  const positionRows = JSON.parse(JSON.stringify(positionRowsRaw));
  const incomesByPosition: Record<number, (typeof positionRows)[number]["IncomeRows"]> = {};
  for (const p of positionRows) {
    incomesByPosition[p.SitePositionID] = p.IncomeRows;
  }

  return (
    <div className="w-full px-6 py-8">
      <Link href="/payroll/sites" className="text-sm text-gray-500 hover:underline">
        ← กลับหน่วยงาน (Site)
      </Link>
      <h1 className="mb-6 mt-2 text-lg font-semibold text-gray-900">
        {site.SiteCode} — {site.SiteName}: ตำแหน่งและรายได้
      </h1>
      <SitePositionsView
        siteCode={siteCode}
        initialRows={positionRows}
        incomesByPosition={incomesByPosition}
        positions={positions}
        incomeTypes={incomeTypes}
        canSave={canSave}
        canDelete={canDelete}
      />
    </div>
  );
}
