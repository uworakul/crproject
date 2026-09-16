import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { apiError, apiSuccess } from "@/lib/api-response";

// Reference data for dropdowns (DefaultSiteCode, permission SiteCode scope).
// Full Site CRUD (create/edit mst_site) belongs to the Payroll module (menu
// "Site"), not built yet — mst_site is currently empty.
export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const sites = await prisma.mstSite.findMany({
    where: { IsActive: true },
    orderBy: { SiteCode: "asc" },
  });

  return apiSuccess(sites);
}
