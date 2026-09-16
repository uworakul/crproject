import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { getWorksheetDetail } from "@/lib/worksheet";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET(_req: Request, ctx: RouteContext<"/api/worksheets/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const worksheetId = Number(id);
  if (!Number.isInteger(worksheetId)) return apiError(400, "INVALID_PARAMS");

  const detail = await getWorksheetDetail(worksheetId);
  if (!detail) return apiError(404, "WORKSHEET_NOT_FOUND");

  const denied = !(await hasPermission(user, "WORKSHEET", "read", detail.siteCode));
  if (denied) return apiError(403, "FORBIDDEN", "Missing 'read' permission on 'WORKSHEET' for this site");

  const [canSave, canApprove] = await Promise.all([
    hasPermission(user, "WORKSHEET", "save", detail.siteCode),
    hasPermission(user, "WORKSHEET", "approve", detail.siteCode),
  ]);

  return apiSuccess({ ...detail, canSave, canApprove });
}
