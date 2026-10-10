import { verifySession } from "@/lib/dal";
import { apiError, apiSuccess } from "@/lib/api-response";
import { DB_CATALOG, allCatalogTables, canManageDatabase, getConditionFields } from "@/lib/db-management";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  if (!canManageDatabase(user)) return apiError(403, "FORBIDDEN");
  return apiSuccess({ groups: DB_CATALOG, conditionFields: await getConditionFields(allCatalogTables()) });
}
