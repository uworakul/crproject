import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { EMPLOYEE_TYPE_VALUES } from "@/lib/validation";

// "ประเภทพนักงานที่ใช้งานได้" checklist (รายวัน/รายเดือน/ทั้งหมด) — same
// mechanism/convention as company-scope above ("ทั้งหมด" is just leaving
// both boxes unchecked, not a 3rd stored value — see EMPLOYEE_TYPE_VALUES).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/users/[userId]/employee-type-scope">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "USER", "read");
  if (denied) return denied;

  const { userId } = await ctx.params;
  const rows = await prisma.sysUserEmployeeType.findMany({ where: { UserID: userId }, select: { EmployeeType: true }, orderBy: { EmployeeType: "asc" } });
  return apiSuccess(rows.map((r) => r.EmployeeType));
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/users/[userId]/employee-type-scope">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "USER", "save");
  if (denied) return denied;

  const { userId } = await ctx.params;
  const target = await prisma.sysUser.findUnique({ where: { UserID: userId } });
  if (!target) return apiError(404, "USER_NOT_FOUND");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }
  if (!Array.isArray(body) || !body.every((v) => typeof v === "string")) {
    return apiError(400, "INVALID_PARAMS", "Request body must be an array of EmployeeType strings");
  }
  const employeeTypes = [...new Set(body as string[])];
  const invalid = employeeTypes.filter((t) => !(EMPLOYEE_TYPE_VALUES as readonly string[]).includes(t));
  if (invalid.length > 0) return apiError(400, "VALIDATION_FAILED", "Unknown EmployeeType", { invalid });

  await prisma.$transaction([
    prisma.sysUserEmployeeType.deleteMany({ where: { UserID: userId } }),
    ...(employeeTypes.length > 0
      ? [prisma.sysUserEmployeeType.createMany({ data: employeeTypes.map((t) => ({ UserID: userId, EmployeeType: t, CreatedBy: user.userId })) })]
      : []),
  ]);

  await logAction(user.userId, "UPDATE_USER_EMPLOYEE_TYPE_SCOPE", { targetTable: "sys_user_employee_type", targetId: userId });
  return apiSuccess({ ok: true, count: employeeTypes.length });
}
