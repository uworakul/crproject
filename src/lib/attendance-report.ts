import "server-only";
import { prisma } from "./prisma";
import type { CurrentUser } from "./dal";
import { employeeScopeWhere } from "./employee-scope";

// "รายงานการลงเวลางาน" visibility reuses the WORKSHEET read permission,
// per-site like the Worksheet screen itself: ADMIN or a SiteCode=NULL row =
// every site, otherwise only the sites with an explicit CanRead row.
export async function readableSiteScope(user: CurrentUser): Promise<{ all: boolean; siteCodes: string[] } | null> {
  if (user.systemLocked) return null;
  if (user.role === "ADMIN") return { all: true, siteCodes: [] };
  const rows = await prisma.sysUserPermission.findMany({ where: { UserID: user.userId, DocumentType: "WORKSHEET", CanRead: true }, select: { SiteCode: true } });
  if (rows.length === 0) return null;
  if (rows.some((r) => r.SiteCode === null)) return { all: true, siteCodes: [] };
  return { all: false, siteCodes: rows.map((r) => r.SiteCode as string) };
}

export function siteWhere(scope: { all: boolean; siteCodes: string[] }, selectedSite?: string) {
  if (scope.all) return selectedSite ? { SiteCode: selectedSite } : {};
  const allowed = selectedSite ? scope.siteCodes.filter((s) => s === selectedSite) : scope.siteCodes;
  return { SiteCode: { in: allowed } };
}

// yyyy-mm-dd (Bangkok calendar day) -> UTC instant range [start, end].
export function bangkokDayRange(from: string, to: string) {
  return { gte: new Date(`${from}T00:00:00+07:00`), lte: new Date(`${to}T23:59:59.999+07:00`) };
}

export async function getAttendanceRows(user: CurrentUser, scope: { all: boolean; siteCodes: string[] }, f: { siteCode?: string; from: string; to: string; empCode?: string }) {
  return prisma.trnAttendanceLog.findMany({
    where: {
      ...siteWhere(scope, f.siteCode),
      CheckInTime: bangkokDayRange(f.from, f.to),
      ...(f.empCode ? { EmpCode: f.empCode } : {}),
      Employee: employeeScopeWhere(user),
    },
    include: { Employee: { select: { FullName: true } }, Site: { select: { SiteName: true } } },
    orderBy: [{ CheckInTime: "asc" }, { EmpCode: "asc" }],
    take: 1000,
  });
}
