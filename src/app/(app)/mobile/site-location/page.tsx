import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { canManageSiteLocation } from "@/lib/mobile-auth";
import SiteLocationView from "./site-location-view";

export default async function SiteLocationPage() {
  const user = await verifySession();
  if (!user) redirect("/login");
  if (!canManageSiteLocation(user)) redirect("/");

  const sites = await prisma.mstSite.findMany({ where: { IsActive: true }, include: { Location: true }, orderBy: { SiteCode: "asc" } });
  const rows = sites.map((s) => ({
    siteCode: s.SiteCode,
    siteName: s.SiteName,
    location: s.Location
      ? { latitude: Number(s.Location.Latitude), longitude: Number(s.Location.Longitude), locationName: s.Location.LocationName ?? "", radiusMeters: s.Location.RadiusMeters }
      : null,
  }));

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <h1 className="text-xl font-semibold text-gray-900">พิกัดหน่วยงาน</h1>
      <p className="mt-1 text-sm text-gray-500">กำหนดพิกัด GPS และระยะที่อนุญาตให้ Check-in / Check-out ของแต่ละหน่วยงาน</p>
      <SiteLocationView initialSites={rows} />
    </div>
  );
}
