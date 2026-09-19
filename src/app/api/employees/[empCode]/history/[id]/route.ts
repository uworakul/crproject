import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Was append-only per BR-013 (no edit/delete) — changed 2026-09-19 at the
// user's explicit request to allow removing a note entered by mistake.
// Hard delete: HistoryID is a standalone BIGINT PK, nothing else references it.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/employees/[empCode]/history/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE_HISTORY", "delete");
  if (denied) return denied;

  const { empCode, id } = await ctx.params;
  let historyId: bigint;
  try {
    historyId = BigInt(id);
  } catch {
    return apiError(400, "INVALID_PARAMS");
  }

  const existing = await prisma.mstEmployeeHistory.findUnique({ where: { HistoryID: historyId } });
  if (!existing || existing.EmpCode !== empCode) return apiError(404, "HISTORY_NOT_FOUND");

  await prisma.mstEmployeeHistory.delete({ where: { HistoryID: historyId } });
  await logAction(user.userId, "DELETE_EMPLOYEE_HISTORY", { targetTable: "mst_employee_history", targetId: id });
  return apiSuccess({ ok: true });
}
