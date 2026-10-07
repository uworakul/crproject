import "server-only";
import { prisma } from "./prisma";

// Shared by GET /api/mobile/attendance and the check-in/check-out Server
// Components (initial render).
export async function getAttendanceState(employee: { EmpCode: string; DefaultSiteCode: string | null }) {
  const [sites, open] = await Promise.all([
    prisma.mstSite.findMany({ where: { IsActive: true }, include: { Location: { select: { RadiusMeters: true } } }, orderBy: { SiteCode: "asc" } }),
    prisma.trnAttendanceLog.findFirst({ where: { EmpCode: employee.EmpCode, CheckOutTime: null }, orderBy: { CheckInTime: "desc" }, include: { Site: { select: { SiteName: true } } } }),
  ]);
  return {
    defaultSiteCode: employee.DefaultSiteCode,
    sites: sites.map((s) => ({ siteCode: s.SiteCode, siteName: s.SiteName, hasLocation: !!s.Location })),
    open: open ? { attendanceId: open.AttendanceID, siteCode: open.SiteCode, siteName: open.Site.SiteName, checkInTime: open.CheckInTime.toISOString() } : null,
  };
}

export type AttendanceState = Awaited<ReturnType<typeof getAttendanceState>>;
