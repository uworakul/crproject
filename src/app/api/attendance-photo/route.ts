import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { apiError } from "@/lib/api-response";
import { readableSiteScope, siteWhere } from "@/lib/attendance-report";
import { employeeScopeWhere } from "@/lib/employee-scope";
import { downloadFileFromR2, R2NotConfiguredError } from "@/lib/r2";

// Authenticated proxy for check-in/out photos (the R2 bucket stays private).
// GET ?id=<AttendanceID>&type=IN|OUT — same site/employee scope as the
// "รายงานการลงเวลางาน" screen that links to it.
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const scope = await readableSiteScope(user);
  if (!scope) return apiError(403, "FORBIDDEN");

  const sp = new URL(request.url).searchParams;
  const id = Number(sp.get("id"));
  const type = sp.get("type");
  if (!Number.isInteger(id) || (type !== "IN" && type !== "OUT")) return apiError(400, "INVALID_PARAMS");

  const log = await prisma.trnAttendanceLog.findFirst({ where: { AttendanceID: id, ...siteWhere(scope), Employee: employeeScopeWhere(user) } });
  const key = type === "IN" ? log?.CheckInPhoto : log?.CheckOutPhoto;
  if (!log || !key) return apiError(404, "PHOTO_NOT_FOUND");

  try {
    const { data, mimeType } = await downloadFileFromR2(key);
    return new Response(new Uint8Array(data), { headers: { "Content-Type": mimeType, "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    if (e instanceof R2NotConfiguredError) return apiError(422, "R2_NOT_CONFIGURED", e.message);
    return apiError(502, "R2_FETCH_FAILED");
  }
}
