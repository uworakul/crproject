import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Full Site management (module 6, "Site") isn't built yet — this is just
// enough (list + create) to unblock Worksheet, which requires at least one
// mst_site row to exist (SiteCode is a required FK on trn_worksheet_header).
export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const sites = await prisma.mstSite.findMany({
    where: { IsActive: true },
    orderBy: { SiteCode: "asc" },
  });

  return apiSuccess(sites);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const denied = await requirePermission(user, "SITE", "save");
  if (denied) return denied;

  let body: { siteCode?: unknown; siteName?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const siteCode = typeof body.siteCode === "string" ? body.siteCode.trim() : "";
  const siteName = typeof body.siteName === "string" ? body.siteName.trim() : "";

  if (!siteCode || !siteName) {
    return apiError(400, "INVALID_PARAMS", "siteCode and siteName are required");
  }

  const existing = await prisma.mstSite.findUnique({ where: { SiteCode: siteCode } });
  if (existing) {
    return apiError(409, "SITE_ALREADY_EXISTS", undefined, { siteCode });
  }

  const created = await prisma.mstSite.create({ data: { SiteCode: siteCode, SiteName: siteName, CreatedBy: user.userId } });

  await logAction(user.userId, "CREATE_SITE", { targetTable: "mst_site", targetId: siteCode });

  return apiSuccess(created, 201);
}
