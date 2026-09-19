import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError } from "@/lib/api-response";
import { buildTwoColumnWorkbook } from "@/lib/excel-reference";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SITE", "read");
  if (denied) return denied;

  const sites = await prisma.mstSite.findMany({ orderBy: { SiteCode: "asc" } });
  const buffer = await buildTwoColumnWorkbook(
    "หน่วยงาน",
    "รหัสหน่วยงาน",
    "ชื่อหน่วยงาน",
    sites.map((s) => ({ code: s.SiteCode, name: s.SiteName })),
  );

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="sites.xlsx"',
    },
  });
}
