import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

interface DayInput {
  worksheetDetailId: number;
  day: number; // 1-31
  attendCode: string | null;
}

// Bulk save for the whole grid in one call — the mockup edits many cells
// before saving, not one request per cell.
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/worksheets/[id]/days">) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }
  if (!Array.isArray(body)) {
    return apiError(400, "INVALID_PARAMS", "Request body must be an array of day entries");
  }
  const entries = body as DayInput[];

  const validDetailIds = new Set(
    (await prisma.trnWorksheetDetail.findMany({ where: { WorksheetID: worksheetId }, select: { WorksheetDetailID: true } })).map(
      (d) => d.WorksheetDetailID,
    ),
  );
  const validAttendCodes = new Set((await prisma.mstAttendanceCode.findMany({ select: { Code: true } })).map((c) => c.Code));
  const lastDay = new Date(header.WorkYear, header.WorkMonth, 0).getDate();

  for (const entry of entries) {
    if (!validDetailIds.has(entry.worksheetDetailId)) {
      return apiError(400, "VALIDATION_FAILED", "Unknown worksheetDetailId", { worksheetDetailId: entry.worksheetDetailId });
    }
    if (!Number.isInteger(entry.day) || entry.day < 1 || entry.day > lastDay) {
      return apiError(400, "VALIDATION_FAILED", "day out of range for this month", { day: entry.day });
    }
    if (entry.attendCode !== null && !validAttendCodes.has(entry.attendCode)) {
      return apiError(400, "VALIDATION_FAILED", "Unknown attendCode", { attendCode: entry.attendCode });
    }
  }

  await prisma.$transaction(
    entries.map((entry) => {
      const workDate = new Date(Date.UTC(header.WorkYear, header.WorkMonth - 1, entry.day));
      if (entry.attendCode === null) {
        return prisma.trnWorksheetDaily.deleteMany({
          where: { WorksheetDetailID: entry.worksheetDetailId, WorkDate: workDate },
        });
      }
      return prisma.trnWorksheetDaily.upsert({
        where: { WorksheetDetailID_WorkDate: { WorksheetDetailID: entry.worksheetDetailId, WorkDate: workDate } },
        update: { AttendCode: entry.attendCode, UpdatedBy: user.userId, UpdatedDate: new Date() },
        create: {
          WorksheetDetailID: entry.worksheetDetailId,
          WorkDate: workDate,
          AttendCode: entry.attendCode,
          UpdatedBy: user.userId,
          CreatedBy: user.userId,
        },
      });
    }),
  );

  await logAction(user.userId, "SAVE_WORKSHEET_DAYS", {
    targetTable: "trn_worksheet_daily",
    targetId: String(worksheetId),
    detail: `${entries.length} cell(s)`,
  });

  return apiSuccess({ ok: true, count: entries.length });
}
