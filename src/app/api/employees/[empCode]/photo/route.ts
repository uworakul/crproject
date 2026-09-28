import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";
import { logAction } from "@/lib/audit-log";
import { uploadFileToR2, deleteFileFromR2, downloadFileFromR2, R2NotConfiguredError } from "@/lib/r2";

// รูปพนักงาน/รูปบัตรประชาชน — เก็บบน Cloudflare R2 (2026-09-26, เดิมเคยเป็น
// Google Drive แต่เปลี่ยนมาใช้ R2 แทนตามที่ผู้ใช้ขอ) ดู src/lib/r2.ts สำหรับ
// เหตุผลด้าน security (ไม่ทำเป็น public link เพราะเป็น PII/รูปบัตรประชาชน)
// ?type=EMPLOYEE|IDCARD เลือกว่าจะอัปโหลด/ดึงรูปไหนของพนักงานคนนี้ — คอลัมน์
// จริงคือ PhotoPath/IDCardPhotoPath บน mst_employee (เก็บ R2 object key
// เท่านั้น) — ไม่มีแนวคิด "โฟลเดอร์" ที่ต้องตั้งค่าแยกต่อ tenant แบบ Drive เดิม
// (sys_config.FileFolder เลิกใช้กับฟีเจอร์นี้แล้ว) เพราะ R2 ใช้ bucket เดียว
// ร่วมกันทุก tenant — object key จึงต้องขึ้นต้นด้วยรหัส tenant เอง (ดู
// user.tenantCode ในฟังก์ชัน POST ด้านล่าง, เพิ่มเมื่อ 2026-09-28) เพื่อแยก
// ไฟล์ของแต่ละลูกค้าไม่ให้ปนกันใน bucket เดียวกัน

type PhotoType = "EMPLOYEE" | "IDCARD";

function photoColumn(type: PhotoType): "PhotoPath" | "IDCardPhotoPath" {
  return type === "EMPLOYEE" ? "PhotoPath" : "IDCardPhotoPath";
}

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function parseType(raw: string | null): PhotoType | null {
  return raw === "EMPLOYEE" || raw === "IDCARD" ? raw : null;
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/employees/[empCode]/photo">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "read");
  if (denied) return denied;

  const { empCode } = await ctx.params;
  const type = parseType(request.nextUrl.searchParams.get("type"));
  if (!type) return apiError(400, "INVALID_PARAMS", "type must be EMPLOYEE or IDCARD");

  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode }, select: { PhotoPath: true, IDCardPhotoPath: true } });
  if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND", undefined, { empCode });

  const fileId = employee[photoColumn(type)];
  if (!fileId) return apiError(404, "PHOTO_NOT_FOUND", "No photo has been uploaded for this employee/type yet");

  try {
    const { data, mimeType } = await downloadFileFromR2(fileId);
    return new Response(new Uint8Array(data), { headers: { "Content-Type": mimeType, "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    if (e instanceof R2NotConfiguredError) return apiError(422, "R2_NOT_CONFIGURED", e.message);
    return apiError(502, "R2_FETCH_FAILED", e instanceof Error ? e.message : "Could not fetch the photo from Cloudflare R2");
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/employees/[empCode]/photo">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "save");
  if (denied) return denied;

  const { empCode } = await ctx.params;
  const type = parseType(request.nextUrl.searchParams.get("type"));
  if (!type) return apiError(400, "INVALID_PARAMS", "type must be EMPLOYEE or IDCARD");

  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode }, select: { PhotoPath: true, IDCardPhotoPath: true } });
  if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND", undefined, { empCode });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request must be multipart/form-data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return apiError(400, "INVALID_PARAMS", "file is required");
  if (!ALLOWED_MIME_TYPES.has(file.type)) return apiError(400, "INVALID_FILE_TYPE", "Only JPEG, PNG, or WEBP images are allowed", { mimeType: file.type });
  if (file.size > MAX_FILE_SIZE) return apiError(400, "FILE_TOO_LARGE", "File must be 5MB or smaller", { size: file.size, maxSize: MAX_FILE_SIZE });

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  // Tenant-scoped subfolder (2026-09-28, requested by the user) — R2 is one
  // bucket shared across every tenant (see r2.ts), so without this,
  // employee photos from different tenants/customers would sit mixed
  // together with no boundary at all. Flat under the tenant code directly
  // (no extra "employee-photos/" segment — this is the only thing using R2
  // in this app right now, so that extra nesting level was redundant; the
  // filename itself already says what it is). user.tenantCode is the
  // tenants.json code ("001"/"002"), not ref_company.CompanyCode —
  // confirmed with the user this means the multi-tenant customer boundary,
  // not the in-tenant "บริษัท" reference table.
  const key = `${user.tenantCode}/${empCode}_${type}_${Date.now()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  let fileId: string;
  try {
    const uploaded = await uploadFileToR2(key, file.type, buffer);
    fileId = uploaded.key;
  } catch (e) {
    if (e instanceof R2NotConfiguredError) return apiError(422, "R2_NOT_CONFIGURED", e.message);
    return apiError(502, "R2_UPLOAD_FAILED", e instanceof Error ? e.message : "Could not upload the file to Cloudflare R2");
  }

  const previousFileId = employee[photoColumn(type)];

  await prisma.mstEmployee.update({
    where: { EmpCode: empCode },
    data: { [photoColumn(type)]: fileId, UpdatedBy: user.userId, UpdatedDate: new Date() },
  });

  if (previousFileId) await deleteFileFromR2(previousFileId);

  await logAction(user.userId, type === "EMPLOYEE" ? "UPLOAD_EMPLOYEE_PHOTO" : "UPLOAD_EMPLOYEE_IDCARD_PHOTO", {
    targetTable: "mst_employee",
    targetId: empCode,
  });

  return apiSuccess({ ok: true });
}
