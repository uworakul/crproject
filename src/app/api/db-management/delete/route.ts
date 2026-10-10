import { NextRequest } from "next/server";
import { verifySession } from "@/lib/dal";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { allCatalogTables, canManageDatabase, getConditionFields, runDelete, validateItems } from "@/lib/db-management";

// POST { items: [{ table, mode: "ALL" | "RANGE", column?, from?, to? }], confirmText: "DELETE" }
// Permanently deletes (children first, one transaction — all or nothing) and
// writes the outcome to sys_process_log.
export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  if (!canManageDatabase(user)) return apiError(403, "FORBIDDEN");
  let body: { items?: unknown; confirmText?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }
  if (body.confirmText !== "DELETE") return apiError(400, "CONFIRM_REQUIRED", "ต้องพิมพ์ DELETE เพื่อยืนยัน");
  const checked = validateItems(body.items, await getConditionFields(allCatalogTables()));
  if (!checked.ok) return apiError(400, "VALIDATION_FAILED", checked.message);

  const result = await runDelete(checked.items, false);
  if (result.error) return apiError(409, "DELETE_FAILED", result.error);
  await logAction(user.userId, "DB_MANAGEMENT_DELETE", {
    targetTable: checked.items.map((i) => i.table).join(",").slice(0, 50),
    detail: JSON.stringify({ items: checked.items.map((i) => (i.mode === "ALL" ? i.table : `${i.table}[${i.column} ${i.from}..${i.to}]`)), deleted: result.counts }).slice(0, 500),
  });
  return apiSuccess({ counts: result.counts });
}
