import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { isValidMemoType } from "@/lib/validation";

// Append-only memo log (BR-013) — no edit/delete, matching the legacy
// system's "history" concept: a record of what was noted and when, not a
// mutable field.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/employees/[empCode]/history">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE_HISTORY", "read");
  if (denied) return denied;

  const { empCode } = await ctx.params;
  const history = await prisma.mstEmployeeHistory.findMany({
    where: { EmpCode: empCode },
    orderBy: { RecordedDate: "desc" },
  });
  return apiSuccess(history);
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/employees/[empCode]/history">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE_HISTORY", "save");
  if (denied) return denied;

  const { empCode } = await ctx.params;
  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND");

  let body: { memoType?: unknown; memoText?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const memoText = typeof body.memoText === "string" ? body.memoText.trim() : "";
  if (!isValidMemoType(body.memoType)) return apiError(400, "VALIDATION_FAILED", "memoType must be one of the allowed values");
  if (!memoText) return apiError(400, "INVALID_PARAMS", "memoText is required");

  const created = await prisma.mstEmployeeHistory.create({
    data: { EmpCode: empCode, MemoType: body.memoType, MemoText: memoText, RecordedBy: user.userId },
  });

  await logAction(user.userId, "ADD_EMPLOYEE_HISTORY", { targetTable: "mst_employee_history", targetId: String(created.HistoryID) });
  return apiSuccess(created, 201);
}
