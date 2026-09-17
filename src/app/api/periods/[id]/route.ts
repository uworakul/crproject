import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/periods/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PERIOD", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const periodId = Number(id);
  if (!Number.isInteger(periodId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.sysPeriod.findUnique({ where: { PeriodID: periodId } });
  if (!existing) return apiError(404, "PERIOD_NOT_FOUND");

  // BR-034: closing is the Payroll module's job now (POST
  // /api/payroll/closing — requires Lock first, irreversible, updates
  // trn_payroll_lock together with Status). This endpoint predates that
  // module and originally toggled Status freely; now that a proper closing
  // workflow exists, letting this endpoint flip Status directly would let
  // anyone with plain PERIOD 'save' bypass the Lock precondition entirely.
  if (existing.Status === "CLOSED") return apiError(409, "PERIOD_CLOSED", "This period is closed and cannot be edited");

  let body: { startDate?: unknown; endDate?: unknown; payDate?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  if (body.status !== undefined) {
    return apiError(400, "VALIDATION_FAILED", "status can no longer be set here — use POST /api/payroll/closing to close a period");
  }

  const updated = await prisma.sysPeriod.update({
    where: { PeriodID: periodId },
    data: {
      StartDate: typeof body.startDate === "string" && body.startDate ? new Date(body.startDate) : undefined,
      EndDate: typeof body.endDate === "string" && body.endDate ? new Date(body.endDate) : undefined,
      PayDate: typeof body.payDate === "string" && body.payDate ? new Date(body.payDate) : undefined,
    },
  });

  await logAction(user.userId, "UPDATE_PERIOD", { targetTable: "sys_period", targetId: id });
  return apiSuccess(updated);
}

// Hard delete — sys_period has no IsActive flag in the DDL. Blocked by
// trn_payroll_transaction/trn_payroll_calculate_log/trn_payroll_lock's NO
// ACTION FKs the moment a period has actually been used, which SQL Server
// will reject on its own; we just surface that cleanly instead of guessing.
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/periods/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "PERIOD", "delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  const periodId = Number(id);
  if (!Number.isInteger(periodId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.sysPeriod.findUnique({ where: { PeriodID: periodId } });
  if (!existing) return apiError(404, "PERIOD_NOT_FOUND");

  try {
    await prisma.sysPeriod.delete({ where: { PeriodID: periodId } });
  } catch {
    return apiError(409, "PERIOD_IN_USE", "This period has payroll data linked to it and cannot be deleted");
  }

  await logAction(user.userId, "DELETE_PERIOD", { targetTable: "sys_period", targetId: id });
  return apiSuccess({ ok: true });
}
