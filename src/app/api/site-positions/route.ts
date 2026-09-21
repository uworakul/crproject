import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Flat endpoint (siteCode as a query param, not a path segment) — same
// precaution as every "detail row of a parent" screen since the Next.js
// 16.3.5 typed-routes generator bug found 2026-09-20 (see CLAUDE.md).
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SITE", "read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const siteCode = searchParams.get("siteCode");
  if (!siteCode) return apiError(400, "INVALID_PARAMS", "siteCode is required");

  const rows = await prisma.mstSitePosition.findMany({
    where: { SiteCode: siteCode },
    include: { Position: { select: { PositionName: true } } },
    orderBy: { PositionCode: "asc" },
  });
  return apiSuccess(rows);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "SITE", "save");
  if (denied) return denied;

  let body: { siteCode?: unknown; positionCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const siteCode = typeof body.siteCode === "string" ? body.siteCode.trim() : "";
  const positionCode = typeof body.positionCode === "string" ? body.positionCode.trim() : "";
  if (!siteCode || !positionCode) return apiError(400, "INVALID_PARAMS", "siteCode and positionCode are required");

  const site = await prisma.mstSite.findUnique({ where: { SiteCode: siteCode } });
  if (!site) return apiError(404, "SITE_NOT_FOUND", undefined, { siteCode });
  const position = await prisma.refPosition.findUnique({ where: { PositionCode: positionCode } });
  if (!position) return apiError(404, "POSITION_NOT_FOUND", undefined, { positionCode });

  const existing = await prisma.mstSitePosition.findUnique({ where: { SiteCode_PositionCode: { SiteCode: siteCode, PositionCode: positionCode } } });
  if (existing) return apiError(409, "SITE_POSITION_ALREADY_EXISTS", undefined, { siteCode, positionCode });

  const created = await prisma.mstSitePosition.create({ data: { SiteCode: siteCode, PositionCode: positionCode, CreatedBy: user.userId } });

  await logAction(user.userId, "CREATE_SITE_POSITION", { targetTable: "mst_site_position", targetId: String(created.SitePositionID) });
  return apiSuccess(created, 201);
}
