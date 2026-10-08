import "server-only";
import { prisma } from "./prisma";
import { logAction } from "./audit-log";
import { saveWorksheetDays } from "./worksheet";

// Auto-post MOBILE check-in/out into the site's Worksheet (2026-10-08), only
// for employees whose company has ref_company.AutoTimeToWorksheet = true.
//
// Rules (confirmed with the user):
//  - Each record is D or N by its CHECK-IN time (Bangkok): D = 00:01-12:00,
//    N = 12:01-24:00 (00:00 counts as N).
//  - D-N: a D and an N on the same date at the same site.
//  - N-D: an N on date X followed by a D check-in on a LATER date at the same
//    site starting within CONTINUE_MINUTES of the N's check-out. Recorded as
//    N-D on X; that D check-in is "consumed" and posts nothing on its own date.
//  - Cells are derived from the records, so re-running is idempotent.
//  - Not postable (no worksheet / not DRAFT / employee not on it): skipped and
//    written to the audit log, never an error for the check-in itself.
const CONTINUE_MINUTES = 60;
const HOUR = 3600 * 1000;

function bkk(d: Date) {
  return new Date(d.getTime() + 7 * HOUR);
}
function dateKey(d: Date) {
  const t = bkk(d);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}
export function shiftOf(checkIn: Date): "D" | "N" {
  const t = bkk(checkIn);
  const secs = t.getUTCHours() * 3600 + t.getUTCMinutes() * 60 + t.getUTCSeconds();
  return secs >= 60 && secs < 12 * 3600 + 60 ? "D" : "N";
}

export async function syncAttendanceToWorksheet(userId: string, empCode: string, siteCode: string, anchor: Date) {
  try {
    const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode }, select: { Company: { select: { AutoTimeToWorksheet: true } } } });
    if (!employee?.Company?.AutoTimeToWorksheet) return;

    const anchorKey = dateKey(anchor);
    const bkkMidnight = (key: string) => new Date(new Date(`${key}T00:00:00Z`).getTime() - 7 * HOUR);
    const dayMs = 24 * HOUR;
    const from = new Date(bkkMidnight(anchorKey).getTime() - 2 * dayMs);
    const to = new Date(bkkMidnight(anchorKey).getTime() + dayMs);
    const logs = await prisma.trnAttendanceLog.findMany({
      where: { EmpCode: empCode, SiteCode: siteCode, CheckInTime: { gte: from, lt: to } },
      orderBy: { CheckInTime: "asc" },
    });

    const days = new Map<string, { D: boolean; N: boolean; nd: boolean }>();
    const consumed = new Set<number>();
    logs.forEach((log, i) => {
      if (consumed.has(i)) return;
      const key = dateKey(log.CheckInTime);
      const day = days.get(key) ?? { D: false, N: false, nd: false };
      const cls = shiftOf(log.CheckInTime);
      day[cls] = true;
      if (cls === "N" && log.CheckOutTime) {
        const next = logs[i + 1];
        if (next && shiftOf(next.CheckInTime) === "D" && dateKey(next.CheckInTime) > key) {
          const gapMin = (next.CheckInTime.getTime() - log.CheckOutTime.getTime()) / 60000;
          if (gapMin >= 0 && gapMin <= CONTINUE_MINUTES) {
            consumed.add(i + 1);
            day.nd = true;
          }
        }
      }
      days.set(key, day);
    });

    const prevKey = dateKey(new Date(anchor.getTime() - dayMs));
    for (const key of [prevKey, anchorKey]) {
      const day = days.get(key);
      if (!day) continue;
      const code = day.D && day.N ? "D-N" : day.N && day.nd ? "N-D" : day.D ? "D" : "N";
      const [y, m, d] = key.split("-").map(Number);

      const skip = (reason: string) => logAction(userId, "AUTO_WORKSHEET_SKIPPED", { targetTable: "trn_worksheet_daily", targetId: `${empCode}@${siteCode}:${key}`, detail: `${code}: ${reason}` });
      const header = await prisma.trnWorksheetHeader.findUnique({ where: { SiteCode_WorkYear_WorkMonth: { SiteCode: siteCode, WorkYear: y, WorkMonth: m } }, select: { WorksheetID: true, Status: true } });
      if (!header) {
        await skip("ไม่มีใบลงเวลาของเดือนนี้");
        continue;
      }
      if (header.Status !== "DRAFT") {
        await skip(`ใบลงเวลาสถานะ ${header.Status} แก้ไขไม่ได้`);
        continue;
      }
      const detail = await prisma.trnWorksheetDetail.findFirst({ where: { WorksheetID: header.WorksheetID, EmpCode: empCode }, select: { WorksheetDetailID: true } });
      if (!detail) {
        await skip("พนักงานไม่อยู่ในใบลงเวลานี้");
        continue;
      }
      const res = await saveWorksheetDays(header.WorksheetID, y, m, [{ worksheetDetailId: detail.WorksheetDetailID, day: d, attendCode: code }], userId);
      if (res.ok) {
        await logAction(userId, "AUTO_WORKSHEET_POSTED", { targetTable: "trn_worksheet_daily", targetId: `${empCode}@${siteCode}:${key}`, detail: code });
      } else {
        await skip(res.error.message);
      }
    }
  } catch (err) {
    // Never fail the check-in/out because the auto-post hiccuped.
    await logAction(userId, "AUTO_WORKSHEET_ERROR", { targetTable: "trn_attendance_log", targetId: empCode, detail: String(err).slice(0, 400) }).catch(() => {});
  }
}
