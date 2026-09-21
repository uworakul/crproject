import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";
import { logAction } from "@/lib/audit-log";
import { getOrCreateSystemConfig } from "@/lib/system-config";
import { uploadFileToDriveFolder, deleteDriveFile, downloadDriveFile, parseDriveFolderId, DriveNotConfiguredError } from "@/lib/google-drive";

// รูปพนักงาน/รูปบัตรประชาชน (2026-09-21) — เก็บบน Google Drive โฟลเดอร์ที่แชร์ไว้
// (sys_config.FileFolder = Drive Folder ID) ผ่าน Service Account, ไม่ใช่ local
// disk — ดู src/lib/google-drive.ts สำหรับเหตุผลด้าน security (ไม่ทำเป็น public
// link เพราะเป็น PII/รูปบัตรประชาชน) ?type=EMPLOYEE|IDCARD เลือกว่าจะอัปโหลด/
// ดึงรูปไหนของพนักงานคนนี้ — คอลัมน์จริงคือ PhotoPath/IDCardPhotoPath บน
// mst_employee (เก็บ Drive file ID เท่านั้น)

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
    const { data, mimeType } = await downloadDriveFile(fileId);
    return new Response(data, { headers: { "Content-Type": mimeType, "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    if (e instanceof DriveNotConfiguredError) return apiError(422, "DRIVE_NOT_CONFIGURED", e.message);
    return apiError(502, "DRIVE_FETCH_FAILED", e instanceof Error ? e.message : "Could not fetch the photo from Google Drive");
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

  const config = await getOrCreateSystemConfig();
  if (!config.FileFolder) return apiError(422, "DRIVE_FOLDER_NOT_CONFIGURED", "Set the shared Google Drive folder ID in System Configuration (File Folder) first");
  const folderId = parseDriveFolderId(config.FileFolder);

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const fileName = `${empCode}_${type}_${Date.now()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  let fileId: string;
  try {
    const uploaded = await uploadFileToDriveFolder(folderId, fileName, file.type, buffer);
    fileId = uploaded.fileId;
  } catch (e) {
    if (e instanceof DriveNotConfiguredError) return apiError(422, "DRIVE_NOT_CONFIGURED", e.message);
    return apiError(502, "DRIVE_UPLOAD_FAILED", e instanceof Error ? e.message : "Could not upload the file to Google Drive");
  }

  const previousFileId = employee[photoColumn(type)];

  await prisma.mstEmployee.update({
    where: { EmpCode: empCode },
    data: { [photoColumn(type)]: fileId, UpdatedBy: user.userId, UpdatedDate: new Date() },
  });

  if (previousFileId) await deleteDriveFile(previousFileId);

  await logAction(user.userId, type === "EMPLOYEE" ? "UPLOAD_EMPLOYEE_PHOTO" : "UPLOAD_EMPLOYEE_IDCARD_PHOTO", {
    targetTable: "mst_employee",
    targetId: empCode,
  });

  return apiSuccess({ ok: true });
}
