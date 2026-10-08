import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireSelfEmployee } from "@/lib/mobile-auth";
import { findSiteByLocation, isValidLatLng } from "@/lib/geo";

// GET ?lat=&lng= — which site (if any) the phone is currently inside.
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const me = await requireSelfEmployee(user);
  if ("error" in me) return me.error;
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  if (!isValidLatLng(lat, lng)) return apiError(422, "GPS_UNAVAILABLE", "ไม่ได้รับพิกัด GPS");
  const sites = await prisma.mstSite.findMany({ where: { IsActive: true }, include: { Location: true } });
  const found = findSiteByLocation(lat, lng, sites);
  if (!found) return apiSuccess({ found: false, message: "ยังไม่ได้ตั้งพิกัดสถานที่นี้ในระบบ" });
  return apiSuccess({ found: true, siteCode: found.site.SiteCode, siteName: found.site.SiteName, distanceMeters: found.distance });
}
