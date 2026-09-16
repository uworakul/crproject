import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

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
