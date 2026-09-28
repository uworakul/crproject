import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError } from "@/lib/api-response";
import { buildSiteWorkbook } from "@/lib/excel-reference";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SITE", "read");
  if (denied) return denied;

  const sites = await prisma.mstSite.findMany({ orderBy: { SiteCode: "asc" } });
  const buffer = await buildSiteWorkbook(
    sites.map((s) => ({ code: s.SiteCode, name: s.SiteName, monthlyServiceFee: s.MonthlyServiceFee ? Number(s.MonthlyServiceFee) : null })),
  );

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="sites.xlsx"',
    },
  });
}
