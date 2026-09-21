import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Removing a required position also removes its income rows (a position
// with no income lines has nothing meaningful left to keep) — done in one
// transaction so it's all-or-nothing.
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/site-positions/[sitePositionId]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SITE", "delete");
  if (denied) return denied;

  const { sitePositionId } = await ctx.params;
  const id = Number(sitePositionId);
  if (!Number.isInteger(id)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.mstSitePosition.findUnique({ where: { SitePositionID: id } });
  if (!existing) return apiError(404, "SITE_POSITION_NOT_FOUND");

  await prisma.$transaction([
    prisma.mstSitePositionIncome.deleteMany({ where: { SitePositionID: id } }),
    prisma.mstSitePosition.delete({ where: { SitePositionID: id } }),
  ]);

  await logAction(user.userId, "DELETE_SITE_POSITION", { targetTable: "mst_site_position", targetId: sitePositionId });
  return apiSuccess({ ok: true });
}
