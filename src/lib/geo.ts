// No "server-only" guard — pure math, harmless on the client too.

// Great-circle distance in whole metres between two lat/lng points
// (Haversine). Good to well under a metre at the few-hundred-metre scale a
// site geofence works at.
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export interface SiteWithLocation {
  SiteCode: string;
  SiteName: string;
  Location: { Latitude: unknown; Longitude: unknown; RadiusMeters: number } | null;
}

// Site whose geofence contains the point, or null. If the point is inside the
// preferred site's geofence (the last site the employee checked out of) that
// site wins; otherwise the nearest containing site.
export function findSiteByLocation<T extends SiteWithLocation>(lat: number, lng: number, sites: T[], preferredSiteCode?: string | null): { site: T; distance: number; radius: number } | null {
  let best: { site: T; distance: number; radius: number } | null = null;
  for (const site of sites) {
    if (!site.Location) continue;
    const distance = distanceMeters(lat, lng, Number(site.Location.Latitude), Number(site.Location.Longitude));
    if (distance > site.Location.RadiusMeters) continue;
    const candidate = { site, distance, radius: site.Location.RadiusMeters };
    if (preferredSiteCode && site.SiteCode === preferredSiteCode) return candidate;
    if (!best || distance < best.distance) best = candidate;
  }
  return best;
}
