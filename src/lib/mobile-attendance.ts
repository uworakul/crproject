import "server-only";
import { prisma } from "./prisma";

// The site of the employee's most recent completed shift (default for check-in).
export async function getLastCheckOutSite(empCode: string) {
  const row = await prisma.trnAttendanceLog.findFirst({
    where: { EmpCode: empCode, CheckOutTime: { not: null } },
    orderBy: { CheckOutTime: "desc" },
    include: { Site: { select: { SiteName: true } } },
  });
  return row ? { siteCode: row.SiteCode, siteName: row.Site.SiteName } : null;
}

// Shared by GET /api/mobile/attendance and the check-in/check-out Server
// Components (initial render).
export async function getAttendanceState(employee: { EmpCode: string; DefaultSiteCode: string | null }) {
  const [sites, open, last] = await Promise.all([
    prisma.mstSite.findMany({ where: { IsActive: true }, include: { Location: { select: { RadiusMeters: true } } }, orderBy: { SiteCode: "asc" } }),
    prisma.trnAttendanceLog.findFirst({ where: { EmpCode: employee.EmpCode, CheckOutTime: null }, orderBy: { CheckInTime: "desc" }, include: { Site: { select: { SiteName: true } } } }),
    getLastCheckOutSite(employee.EmpCode),
  ]);
  return {
    defaultSiteCode: employee.DefaultSiteCode,
    lastSite: last,
    sites: sites.map((s) => ({ siteCode: s.SiteCode, siteName: s.SiteName, hasLocation: !!s.Location })),
    open: open ? { attendanceId: open.AttendanceID, siteCode: open.SiteCode, siteName: open.Site.SiteName, checkInTime: open.CheckInTime.toISOString() } : null,
  };
}

export type AttendanceState = Awaited<ReturnType<typeof getAttendanceState>>;
