import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { QUOTA_TYPE_VALUES } from "@/lib/validation";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/employees/[empCode]/quota">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "read");
  if (denied) return denied;

  const { empCode } = await ctx.params;
  const quotas = await prisma.mstEmployeeQuota.findMany({ where: { EmpCode: empCode }, orderBy: { QuotaType: "asc" } });
  return apiSuccess(quotas);
}

// Updates QuotaLimit only — QuotaUsed is maintained by the Request &
// Approve module (not built yet) when a request is approved; QuotaRemaining
// is kept consistent here as Limit - Used (per the Data Dictionary note
// that it's a derived value the app must keep in sync itself).
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/employees/[empCode]/quota">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "save");
  if (denied) return denied;

  const { empCode } = await ctx.params;
  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }
  if (!Array.isArray(body)) return apiError(400, "INVALID_PARAMS", "Request body must be an array");

  const entries = body as { quotaType?: unknown; quotaLimit?: unknown }[];
  for (const e of entries) {
    if (typeof e.quotaType !== "string" || !(QUOTA_TYPE_VALUES as readonly string[]).includes(e.quotaType)) {
      return apiError(400, "VALIDATION_FAILED", "Unknown quotaType", { quotaType: e.quotaType });
    }
    const n = Number(e.quotaLimit);
    if (!Number.isFinite(n) || n < 0) return apiError(400, "VALIDATION_FAILED", "quotaLimit must be a non-negative number");
  }

  await prisma.$transaction(
    entries.map((e) => {
      const limit = Number(e.quotaLimit);
      return prisma.mstEmployeeQuota.updateMany({
        where: { EmpCode: empCode, QuotaType: e.quotaType as string },
        data: { QuotaLimit: limit },
      });
    }),
  );

  // QuotaRemaining = Limit - Used, recomputed per row (used may differ per type).
  const rows = await prisma.mstEmployeeQuota.findMany({ where: { EmpCode: empCode } });
  await prisma.$transaction(
    rows.map((r) =>
      prisma.mstEmployeeQuota.update({
        where: { QuotaID: r.QuotaID },
        data: { QuotaRemaining: r.QuotaLimit.sub(r.QuotaUsed) },
      }),
    ),
  );

  await logAction(user.userId, "UPDATE_EMPLOYEE_QUOTA", { targetTable: "mst_employee_quota", targetId: empCode });

  const updated = await prisma.mstEmployeeQuota.findMany({ where: { EmpCode: empCode }, orderBy: { QuotaType: "asc" } });
  return apiSuccess(updated);
}
