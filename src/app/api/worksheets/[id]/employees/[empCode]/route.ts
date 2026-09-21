import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { resolveEffectiveDailyRate } from "@/lib/worksheet";

// 2026-09-21 — เปลี่ยนตำแหน่งของ SPARE row (เฉพาะ SPARE เท่านั้น — REGULAR
// snapshot มาจาก mst_employee.PositionCode อัตโนมัติตอนดึงเข้า ไม่ให้แก้ตรงนี้
// เพราะจะทำให้ไม่ตรงกับตำแหน่งจริงในทะเบียนพนักงาน) recompute DailyRate ใหม่
// ตามตำแหน่งที่เปลี่ยน (3-tier fallback เดียวกับตอนเพิ่ม, ไม่แตะ
// mst_employee.DailyRate ของพนักงานคนนั้นเลย — เปลี่ยนแค่ snapshot บนแถวนี้)
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/worksheets/[id]/employees/[empCode]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id, empCode } = await ctx.params;
  const worksheetId = Number(id);
  if (!Number.isInteger(worksheetId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.trnWorksheetHeader.findUnique({ where: { WorksheetID: worksheetId } });
  if (!header) return apiError(404, "WORKSHEET_NOT_FOUND");

  const denied = !(await hasPermission(user, "WORKSHEET", "save", header.SiteCode));
  if (denied) return apiError(403, "FORBIDDEN", "Missing 'save' permission on 'WORKSHEET' for this site");

  if (header.Status !== "DRAFT") {
    return apiError(409, "WORKSHEET_LOCKED", "Only a DRAFT worksheet can be edited", { status: header.Status });
  }

  const detail = await prisma.trnWorksheetDetail.findUnique({
    where: { WorksheetID_EmpCode: { WorksheetID: worksheetId, EmpCode: empCode } },
  });
  if (!detail) return apiError(404, "EMPLOYEE_NOT_ON_WORKSHEET", undefined, { empCode });
  if (detail.EmpType !== "SPARE") {
    return apiError(400, "VALIDATION_FAILED", "Only a SPARE employee's position can be changed here", { empCode });
  }

  let body: { positionCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }
  const positionCode = typeof body.positionCode === "string" ? body.positionCode.trim() : "";
  if (!positionCode) return apiError(400, "INVALID_PARAMS", "positionCode is required");

  const position = await prisma.refPosition.findUnique({ where: { PositionCode: positionCode } });
  if (!position) return apiError(404, "POSITION_NOT_FOUND", undefined, { positionCode });

  const employee = await prisma.mstEmployee.findUniqueOrThrow({ where: { EmpCode: empCode } });
  const effectiveDailyRate = await resolveEffectiveDailyRate(header.SiteCode, employee.DailyRate, positionCode);
  if (!effectiveDailyRate) {
    return apiError(400, "VALIDATION_FAILED", "Employee has no DailyRate set (and no Site/Position rate fallback for the chosen position)", { empCode, positionCode });
  }

  const updated = await prisma.trnWorksheetDetail.update({
    where: { WorksheetDetailID: detail.WorksheetDetailID },
    data: { PositionCode: positionCode, DailyRate: effectiveDailyRate, UpdatedBy: user.userId, UpdatedDate: new Date() },
  });

  await logAction(user.userId, "UPDATE_WORKSHEET_EMPLOYEE_POSITION", {
    targetTable: "trn_worksheet_detail",
    targetId: String(detail.WorksheetDetailID),
    detail: `Worksheet ${worksheetId}, employee ${empCode}, position -> ${positionCode}`,
  });

  return apiSuccess(updated);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/worksheets/[id]/employees/[empCode]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id, empCode } = await ctx.params;
  const worksheetId = Number(id);
  if (!Number.isInteger(worksheetId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.trnWorksheetHeader.findUnique({ where: { WorksheetID: worksheetId } });
  if (!header) return apiError(404, "WORKSHEET_NOT_FOUND");

  const denied = !(await hasPermission(user, "WORKSHEET", "save", header.SiteCode));
  if (denied) return apiError(403, "FORBIDDEN", "Missing 'save' permission on 'WORKSHEET' for this site");

  if (header.Status !== "DRAFT") {
    return apiError(409, "WORKSHEET_LOCKED", "Only a DRAFT worksheet can be edited", { status: header.Status });
  }

  const detail = await prisma.trnWorksheetDetail.findUnique({
    where: { WorksheetID_EmpCode: { WorksheetID: worksheetId, EmpCode: empCode } },
  });
  if (!detail) return apiError(404, "EMPLOYEE_NOT_ON_WORKSHEET", undefined, { empCode });

  await prisma.$transaction([
    prisma.trnWorksheetDaily.deleteMany({ where: { WorksheetDetailID: detail.WorksheetDetailID } }),
    prisma.trnWorksheetDetail.delete({ where: { WorksheetDetailID: detail.WorksheetDetailID } }),
  ]);

  await logAction(user.userId, "REMOVE_WORKSHEET_EMPLOYEE", {
    targetTable: "trn_worksheet_detail",
    targetId: String(detail.WorksheetDetailID),
    detail: `Worksheet ${worksheetId}, employee ${empCode}`,
  });

  return apiSuccess({ ok: true });
}
