import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { getWorksheetDetail } from "@/lib/worksheet";
import { buildWorksheetWorkbook } from "@/lib/excel-reference";
import { apiError } from "@/lib/api-response";

export async function GET(_req: Request, ctx: RouteContext<"/api/worksheets/[id]/export">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const worksheetId = Number(id);
  if (!Number.isInteger(worksheetId)) return apiError(400, "INVALID_PARAMS");

  const detail = await getWorksheetDetail(worksheetId);
  if (!detail) return apiError(404, "WORKSHEET_NOT_FOUND");

  const denied = !(await hasPermission(user, "WORKSHEET", "read", detail.siteCode));
  if (denied) return apiError(403, "FORBIDDEN", "Missing 'read' permission on 'WORKSHEET' for this site");

  const daysInMonth = new Date(detail.workYear, detail.workMonth, 0).getDate();
  const buffer = await buildWorksheetWorkbook(
    daysInMonth,
    detail.details.map((d) => ({
      empCode: d.empCode,
      empName: d.empName,
      empType: d.empType,
      positionName: d.positionName,
      dailyRate: Number(d.dailyRate),
      days: d.days.map((day) => day.attendCode),
      total: Number(d.total),
    })),
  );

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="worksheet_${detail.siteCode}_${detail.workYear}${String(detail.workMonth).padStart(2, "0")}.xlsx"`,
    },
  });
}
