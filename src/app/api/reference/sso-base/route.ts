import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "read");
  if (denied) return denied;

  const rows = await prisma.refSsoBase.findMany({ orderBy: { EffectiveYear: "desc" } });
  return apiSuccess(rows);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "save");
  if (denied) return denied;

  let body: {
    effectiveYear?: unknown;
    effectiveDate?: unknown;
    minBase?: unknown;
    maxBase?: unknown;
    employeeRate?: unknown;
    employerRate?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const effectiveYear = Number(body.effectiveYear);
  const minBase = Number(body.minBase);
  const maxBase = Number(body.maxBase);
  const employeeRate = Number(body.employeeRate);
  const employerRate = Number(body.employerRate);

  if (![effectiveYear, minBase, maxBase, employeeRate, employerRate].every(Number.isFinite)) {
    return apiError(400, "INVALID_PARAMS", "effectiveYear, minBase, maxBase, employeeRate, and employerRate are required");
  }
  if (maxBase <= minBase) return apiError(400, "VALIDATION_FAILED", "maxBase must be greater than minBase");
  if (employeeRate < 0 || employeeRate > 1 || employerRate < 0 || employerRate > 1) {
    return apiError(400, "VALIDATION_FAILED", "employeeRate and employerRate must be between 0 and 1");
  }

  // EffectiveDate is purely informational (the exact date the rate took
  // effect, e.g. 2026-01-01 for the SSO ceiling change) — Calculate still
  // looks rates up by EffectiveYear only (src/lib/payroll.ts), unchanged.
  let effectiveDate: Date | undefined;
  if (typeof body.effectiveDate === "string" && body.effectiveDate) {
    effectiveDate = new Date(body.effectiveDate);
    if (Number.isNaN(effectiveDate.getTime())) return apiError(400, "VALIDATION_FAILED", "effectiveDate is invalid");
  }

  const created = await prisma.refSsoBase.create({
    data: { EffectiveYear: effectiveYear, EffectiveDate: effectiveDate, MinBase: minBase, MaxBase: maxBase, EmployeeRate: employeeRate, EmployerRate: employerRate },
  });
  await logAction(user.userId, "CREATE_SSO_BASE", { targetTable: "ref_sso_base", targetId: String(created.SSOBaseID) });
  return apiSuccess(created, 201);
}
