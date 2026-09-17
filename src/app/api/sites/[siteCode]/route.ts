import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/sites/[siteCode]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { siteCode } = await ctx.params;
  const site = await prisma.mstSite.findUnique({ where: { SiteCode: siteCode } });
  if (!site) return apiError(404, "SITE_NOT_FOUND");
  return apiSuccess(site);
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/sites/[siteCode]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SITE", "save");
  if (denied) return denied;

  const { siteCode } = await ctx.params;
  const existing = await prisma.mstSite.findUnique({ where: { SiteCode: siteCode } });
  if (!existing) return apiError(404, "SITE_NOT_FOUND");

  let body: { siteName?: unknown; isActive?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const siteName = typeof body.siteName === "string" ? body.siteName.trim() : "";
  if (!siteName) return apiError(400, "INVALID_PARAMS", "siteName is required");

  const updated = await prisma.mstSite.update({
    where: { SiteCode: siteCode },
    data: { SiteName: siteName, IsActive: typeof body.isActive === "boolean" ? body.isActive : existing.IsActive },
  });

  await logAction(user.userId, "UPDATE_SITE", { targetTable: "mst_site", targetId: siteCode });
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/sites/[siteCode]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SITE", "delete");
  if (denied) return denied;

  const { siteCode } = await ctx.params;
  const existing = await prisma.mstSite.findUnique({ where: { SiteCode: siteCode } });
  if (!existing) return apiError(404, "SITE_NOT_FOUND");

  const updated = await prisma.mstSite.update({ where: { SiteCode: siteCode }, data: { IsActive: false } });
  await logAction(user.userId, "DEACTIVATE_SITE", { targetTable: "mst_site", targetId: siteCode });
  return apiSuccess(updated);
}
