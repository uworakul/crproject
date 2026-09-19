import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Adds a SPARE employee row (REGULAR employees are pulled in automatically
// when the draft is created — see getOrCreateDraftWorksheet).
export async function POST(request: NextRequest, ctx: RouteContext<"/api/worksheets/[id]/employees">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const worksheetId = Number(id);
  if (!Number.isInteger(worksheetId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.trnWorksheetHeader.findUnique({ where: { WorksheetID: worksheetId } });
  if (!header) return apiError(404, "WORKSHEET_NOT_FOUND");

  const denied = !(await hasPermission(user, "WORKSHEET", "save", header.SiteCode));
  if (denied) return apiError(403, "FORBIDDEN", "Missing 'save' permission on 'WORKSHEET' for this site");

  if (header.Status !== "DRAFT") {
    return apiError(409, "WORKSHEET_LOCKED", "Only a DRAFT worksheet can be edited", { status: header.Status });
  }

  let body: { empCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const empCode = typeof body.empCode === "string" ? body.empCode.trim() : "";
  if (!empCode) return apiError(400, "INVALID_PARAMS", "empCode is required");

  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND", undefined, { empCode });
  if (!employee.DailyRate) {
    return apiError(400, "VALIDATION_FAILED", "Employee has no DailyRate set", { empCode });
  }

  const alreadyOnSheet = await prisma.trnWorksheetDetail.findUnique({
    where: { WorksheetID_EmpCode: { WorksheetID: worksheetId, EmpCode: empCode } },
  });
  if (alreadyOnSheet) {
    return apiError(409, "EMPLOYEE_ALREADY_ON_WORKSHEET", undefined, { empCode });
  }

  const maxOrder = await prisma.trnWorksheetDetail.aggregate({
    where: { WorksheetID: worksheetId },
    _max: { DisplayOrder: true },
  });

  const displayOrder = (maxOrder._max.DisplayOrder ?? -1) + 1;

  // Raw INSERT — see comment in src/lib/worksheet.ts: Prisma 7 drops
  // .create() for models with an Unsupported("rowversion") field.
  const [{ WorksheetDetailID: worksheetDetailId }] = await prisma.$queryRaw<{ WorksheetDetailID: number }[]>`
    INSERT INTO trn_worksheet_detail (WorksheetID, EmpCode, EmpType, DailyRate, DisplayOrder, CreatedBy)
    OUTPUT INSERTED.WorksheetDetailID
    VALUES (${worksheetId}, ${empCode}, 'SPARE', ${employee.DailyRate}, ${displayOrder}, ${user.userId})
  `;

  await logAction(user.userId, "ADD_WORKSHEET_EMPLOYEE", {
    targetTable: "trn_worksheet_detail",
    targetId: String(worksheetDetailId),
    detail: `Worksheet ${worksheetId}, employee ${empCode}`,
  });

  return apiSuccess({ worksheetDetailId }, 201);
}

// Remove every employee row at once (2026-09-19) — same DRAFT-only rule as
// removing one, just applied to the whole worksheet.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/worksheets/[id]/employees">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const worksheetId = Number(id);
  if (!Number.isInteger(worksheetId)) return apiError(400, "INVALID_PARAMS");

  const header = await prisma.trnWorksheetHeader.findUnique({ where: { WorksheetID: worksheetId } });
  if (!header) return apiError(404, "WORKSHEET_NOT_FOUND");

  const denied = !(await hasPermission(user, "WORKSHEET", "save", header.SiteCode));
  if (denied) return apiError(403, "FORBIDDEN", "Missing 'save' permission on 'WORKSHEET' for this site");

  if (header.Status !== "DRAFT") {
    return apiError(409, "WORKSHEET_LOCKED", "Only a DRAFT worksheet can be edited", { status: header.Status });
  }

  const details = await prisma.trnWorksheetDetail.findMany({ where: { WorksheetID: worksheetId }, select: { WorksheetDetailID: true } });
  const detailIds = details.map((d) => d.WorksheetDetailID);

  await prisma.$transaction([
    prisma.trnWorksheetDaily.deleteMany({ where: { WorksheetDetailID: { in: detailIds } } }),
    prisma.trnWorksheetDetail.deleteMany({ where: { WorksheetID: worksheetId } }),
  ]);

  await logAction(user.userId, "REMOVE_ALL_WORKSHEET_EMPLOYEES", {
    targetTable: "trn_worksheet_detail",
    targetId: String(worksheetId),
    detail: `Removed ${detailIds.length} employee row(s)`,
  });

  return apiSuccess({ ok: true, removed: detailIds.length });
}
