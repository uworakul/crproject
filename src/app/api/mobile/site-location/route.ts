import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { canManageSiteLocation } from "@/lib/mobile-auth";
import { isValidLatLng } from "@/lib/geo";

// GET: every active site + its geofence (null if not set yet).
export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  if (!canManageSiteLocation(user)) return apiError(403, "FORBIDDEN", "Only SITE_HEAD, ADMIN or APPROVER can manage site locations");

  const sites = await prisma.mstSite.findMany({ where: { IsActive: true }, include: { Location: true }, orderBy: { SiteCode: "asc" } });
  return apiSuccess(
    sites.map((s) => ({
      siteCode: s.SiteCode,
      siteName: s.SiteName,
      location: s.Location
        ? { latitude: Number(s.Location.Latitude), longitude: Number(s.Location.Longitude), locationName: s.Location.LocationName, radiusMeters: s.Location.RadiusMeters }
        : null,
    })),
  );
}

// PUT: create-or-replace a site's geofence.
export async function PUT(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  if (!canManageSiteLocation(user)) return apiError(403, "FORBIDDEN", "Only SITE_HEAD, ADMIN or APPROVER can manage site locations");

  let body: { siteCode?: unknown; latitude?: unknown; longitude?: unknown; locationName?: unknown; radiusMeters?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }
  const siteCode = typeof body.siteCode === "string" ? body.siteCode.trim() : "";
  const lat = typeof body.latitude === "number" ? body.latitude : Number(body.latitude);
  const lng = typeof body.longitude === "number" ? body.longitude : Number(body.longitude);
  const radius = Number(body.radiusMeters);
  if (!siteCode) return apiError(400, "INVALID_PARAMS", "siteCode is required");
  if (!isValidLatLng(lat, lng)) return apiError(400, "VALIDATION_FAILED", "latitude/longitude are missing or out of range");
  if (!Number.isInteger(radius) || radius <= 0 || radius > 100000) return apiError(400, "VALIDATION_FAILED", "radiusMeters must be a whole number of metres, greater than 0");
  const locationName = typeof body.locationName === "string" && body.locationName.trim() ? body.locationName.trim().slice(0, 200) : null;

  const site = await prisma.mstSite.findUnique({ where: { SiteCode: siteCode } });
  if (!site) return apiError(404, "SITE_NOT_FOUND", undefined, { siteCode });

  const saved = await prisma.mstSiteLocation.upsert({
    where: { SiteCode: siteCode },
    create: { SiteCode: siteCode, Latitude: lat, Longitude: lng, LocationName: locationName, RadiusMeters: radius, CreatedBy: user.userId },
    update: { Latitude: lat, Longitude: lng, LocationName: locationName, RadiusMeters: radius, UpdatedBy: user.userId, UpdatedDate: new Date() },
  });
  await logAction(user.userId, "SAVE_SITE_LOCATION", { targetTable: "mst_site_location", targetId: siteCode });
  return apiSuccess({ siteCode: saved.SiteCode });
}
