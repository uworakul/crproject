import { NextRequest } from "next/server";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { getOrCreateDraftWorksheet, getWorksheetDetail } from "@/lib/worksheet";
import { apiError, apiSuccess } from "@/lib/api-response";

// FSD §6: GET /api/worksheets?site=&year=&month= auto-creates the DRAFT if
// it doesn't exist yet (pulling REGULAR employees), then returns full detail.
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const siteCode = request.nextUrl.searchParams.get("site");
  const year = Number(request.nextUrl.searchParams.get("year"));
  const month = Number(request.nextUrl.searchParams.get("month"));

  if (!siteCode || !year || !month || month < 1 || month > 12) {
    return apiError(400, "INVALID_PARAMS", "site, year, and month (1-12) are required");
  }

  const denied = !(await hasPermission(user, "WORKSHEET", "read", siteCode));
  if (denied) return apiError(403, "FORBIDDEN", "Missing 'read' permission on 'WORKSHEET' for this site");

  const worksheetId = await getOrCreateDraftWorksheet(siteCode, year, month, user.userId);
  const detail = await getWorksheetDetail(worksheetId);
  if (!detail) return apiError(404, "WORKSHEET_NOT_FOUND");

  const [canSave, canApprove] = await Promise.all([
    hasPermission(user, "WORKSHEET", "save", siteCode),
    hasPermission(user, "WORKSHEET", "approve", siteCode),
  ]);

  return apiSuccess({ ...detail, canSave, canApprove });
}
