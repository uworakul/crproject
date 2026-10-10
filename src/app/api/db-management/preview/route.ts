import { NextRequest } from "next/server";
import { verifySession } from "@/lib/dal";
import { apiError, apiSuccess } from "@/lib/api-response";
import { allCatalogTables, canManageDatabase, getConditionFields, runDelete, validateItems } from "@/lib/db-management";

// POST { items: [{ table, mode: "ALL" | "RANGE", column?, from?, to? }] }
// Dry run: performs the deletes (cascade included) inside a transaction that
// is always rolled back, so the counts are exact and nothing is removed.
export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  if (!canManageDatabase(user)) return apiError(403, "FORBIDDEN");
  let body: { items?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }
  const checked = validateItems(body.items, await getConditionFields(allCatalogTables()));
  if (!checked.ok) return apiError(400, "VALIDATION_FAILED", checked.message);

  const result = await runDelete(checked.items, true);
  if (result.error) return apiError(409, "DELETE_FAILED", result.error);
  return apiSuccess({ counts: result.counts });
}
