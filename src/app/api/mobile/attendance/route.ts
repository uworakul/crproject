import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireSelfEmployee } from "@/lib/mobile-auth";
import { getAttendanceState } from "@/lib/mobile-attendance";
import { distanceMeters, findSiteByLocation, isValidLatLng } from "@/lib/geo";
import { syncAttendanceToWorksheet } from "@/lib/attendance-worksheet";
import { uploadFileToR2, deleteFileFromR2, R2NotConfiguredError } from "@/lib/r2";

// Every check-in/out must carry a photo taken live with the device camera
// (the screen uses getUserMedia + canvas, no file picker). The canvas always
// emits JPEG, so only JPEG is accepted, verified by magic bytes (the
// browser-supplied Content-Type alone proves nothing).
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
function isJpeg(buf: Buffer) {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}
const pad = (n: number) => String(n).padStart(2, "0");
// Bangkok wall-clock yyyyMMdd-HHmmss, e.g. 20261007-081530 — the "TIME" part
// of the object key (the server's own clock, never the client's).
function bangkokStamp(d: Date) {
  const t = new Date(d.getTime() + 7 * 3600 * 1000);
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}-${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}`;
}

// GET: what the check-in/check-out screens need — the employee's own default
// site, every active site (with whether a geofence is set), and their
// still-open check-in if any (CheckOutTime IS NULL).
export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const me = await requireSelfEmployee(user);
  if ("error" in me) return me.error;

  return apiSuccess(await getAttendanceState(me.employee));
}

// POST multipart/form-data: action ("CHECK_IN" | "CHECK_OUT"), siteCode (CHECK_IN only),
// latitude, longitude, photo (JPEG from the live camera)
// Distance is computed here from the coordinates the phone sent — the client
// never gets to say "I'm close enough". Every refusal returns 422 with a
// machine-readable `error` and a Thai `message` the screen shows as-is.
export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const me = await requireSelfEmployee(user);
  if ("error" in me) return me.error;
  const empCode = me.employee.EmpCode;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be multipart/form-data");
  }
  const action = form.get("action");
  if (action !== "CHECK_IN" && action !== "CHECK_OUT") return apiError(400, "INVALID_PARAMS", "action must be CHECK_IN or CHECK_OUT");
  const lat = Number(form.get("latitude"));
  const lng = Number(form.get("longitude"));
  if (!isValidLatLng(lat, lng)) return apiError(422, "GPS_UNAVAILABLE", "ไม่ได้รับพิกัด GPS จากอุปกรณ์ กรุณาเปิด GPS/อนุญาตการเข้าถึงตำแหน่งแล้วลองใหม่");

  if (me.employee.EmployeeStatus === "RESIGNED" || me.employee.EmployeeStatus === "TERMINATED") {
    return apiError(422, "EMPLOYEE_NOT_ELIGIBLE", "สถานะพนักงานไม่อนุญาตให้บันทึกเวลา");
  }

  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return apiError(422, "PHOTO_REQUIRED", "กรุณาถ่ายรูปยืนยันก่อนบันทึกเวลา");
  if (photo.size > MAX_PHOTO_BYTES) return apiError(422, "PHOTO_TOO_LARGE", "รูปมีขนาดใหญ่เกิน 5MB");
  const photoBuffer = Buffer.from(await photo.arrayBuffer());
  if (!isJpeg(photoBuffer)) return apiError(422, "INVALID_PHOTO", "รูปไม่ถูกต้อง กรุณาถ่ายรูปใหม่ด้วยกล้อง");

  const open = await prisma.trnAttendanceLog.findFirst({ where: { EmpCode: empCode, CheckOutTime: null }, orderBy: { CheckInTime: "desc" } });

  let siteCode: string;
  if (action === "CHECK_IN") {
    if (open) {
      return apiError(422, "ALREADY_CHECKED_IN", "คุณ Check-in อยู่แล้ว ต้อง Check-out ก่อนจึงจะ Check-in ใหม่ได้", { checkInTime: open.CheckInTime });
    }
    // Site is auto-detected from the phone's GPS (nearest geofence containing
    // the point) — the client never picks or sends a site.
    const allSites = await prisma.mstSite.findMany({ where: { IsActive: true }, include: { Location: true } });
    const found = findSiteByLocation(lat, lng, allSites);
    if (!found) return apiError(422, "SITE_NOT_DETECTED", "ยังไม่ได้ตั้งพิกัดสถานที่นี้ในระบบ (ไม่พบหน่วยงานในรัศมีตำแหน่งปัจจุบัน)");
    siteCode = found.site.SiteCode;
  } else {
    if (!open) return apiError(422, "NOT_CHECKED_IN", "ยังไม่ได้ Check-in จึงไม่สามารถ Check-out ได้");
    // Check-out is always measured against the site the shift was opened at.
    siteCode = open.SiteCode;
  }

  const site = await prisma.mstSite.findUnique({ where: { SiteCode: siteCode }, include: { Location: true } });
  if (!site || !site.IsActive) return apiError(404, "SITE_NOT_FOUND", "ไม่พบหน่วยงานนี้", { siteCode });
  if (!site.Location) {
    return apiError(422, "SITE_LOCATION_NOT_SET", `หน่วยงาน ${site.SiteName} ยังไม่ได้ตั้งพิกัด กรุณาแจ้งหัวหน้าหน่วยงาน/ผู้ดูแลระบบ`);
  }
  const distance = distanceMeters(lat, lng, Number(site.Location.Latitude), Number(site.Location.Longitude));
  if (distance > site.Location.RadiusMeters) {
    return apiError(422, "OUT_OF_RANGE", `อยู่ห่างจากหน่วยงานเกินกำหนด (ห่าง ${distance} เมตร, อนุญาตไม่เกิน ${site.Location.RadiusMeters} เมตร)`, {
      distanceMeters: distance,
      radiusMeters: site.Location.RadiusMeters,
    });
  }

  const now = new Date();
  // Upload only after every business check above has passed, so a refused
  // attempt never leaves a photo behind. Key: <tenant>/TIME/<time>_<emp>_<IN|OUT>.jpg (the bucket itself is crpayroll-photos)
  const photoKey = `${user.tenantCode}/TIME/${bangkokStamp(now)}_${empCode}_${action === "CHECK_IN" ? "IN" : "OUT"}.jpg`;
  try {
    await uploadFileToR2(photoKey, "image/jpeg", photoBuffer);
  } catch (e) {
    if (e instanceof R2NotConfiguredError) return apiError(422, "R2_NOT_CONFIGURED", "ระบบเก็บรูปภาพยังไม่ได้ตั้งค่า กรุณาแจ้งผู้ดูแลระบบ");
    return apiError(502, "PHOTO_UPLOAD_FAILED", "อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่");
  }

  if (action === "CHECK_IN") {
    let created;
    try {
      created = await prisma.trnAttendanceLog.create({
        data: { EmpCode: empCode, SiteCode: siteCode, CheckInTime: now, CheckInLat: lat, CheckInLng: lng, CheckInDistance: distance, CheckInPhoto: photoKey, CreatedBy: user.userId },
      });
    } catch (err) {
      // Filtered unique index UX_trn_attendance_log_one_open_per_emp fired: a
      // concurrent CHECK-IN won the race. Duck-typed on .code (not instanceof)
      // — see CLAUDE.md, instanceof Prisma errors is unreliable across the
      // per-route Turbopack bundles.
      await deleteFileFromR2(photoKey);
      if ((err as { code?: string })?.code === "P2002") {
        return apiError(422, "ALREADY_CHECKED_IN", "คุณ Check-in อยู่แล้ว ต้อง Check-out ก่อนจึงจะ Check-in ใหม่ได้");
      }
      throw err;
    }
    await logAction(user.userId, "CHECK_IN", { targetTable: "trn_attendance_log", targetId: String(created.AttendanceID) });
    await syncAttendanceToWorksheet(user.userId, empCode, siteCode, now);
    return apiSuccess({ action, siteCode, siteName: site.SiteName, time: now, distanceMeters: distance }, 201);
  }

  // Atomic guard: only closes the row while it is still open, so two near-
  // simultaneous check-out taps cannot both succeed.
  const closed = await prisma.trnAttendanceLog.updateMany({
    where: { AttendanceID: open!.AttendanceID, CheckOutTime: null },
    data: { CheckOutTime: now, CheckOutLat: lat, CheckOutLng: lng, CheckOutDistance: distance, CheckOutPhoto: photoKey, UpdatedBy: user.userId, UpdatedDate: now },
  });
  if (closed.count === 0) {
    await deleteFileFromR2(photoKey);
    return apiError(422, "NOT_CHECKED_IN", "ยังไม่ได้ Check-in จึงไม่สามารถ Check-out ได้");
  }
  await logAction(user.userId, "CHECK_OUT", { targetTable: "trn_attendance_log", targetId: String(open!.AttendanceID) });
  await syncAttendanceToWorksheet(user.userId, empCode, siteCode, open!.CheckInTime);
  return apiSuccess({ action, siteCode, siteName: site.SiteName, time: now, distanceMeters: distance });
}
