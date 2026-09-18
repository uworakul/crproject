import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/reference/departments/[code]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "save");
  if (denied) return denied;

  const { code } = await ctx.params;
  const existing = await prisma.refDepartment.findUnique({ where: { DeptCode: code } });
  if (!existing) return apiError(404, "DEPARTMENT_NOT_FOUND");

  let body: { deptName?: unknown; isActive?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const updated = await prisma.refDepartment.update({
    where: { DeptCode: code },
    data: {
      DeptName: typeof body.deptName === "string" ? body.deptName.trim() : undefined,
      IsActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_DEPARTMENT", { targetTable: "ref_department", targetId: code });
  return apiSuccess(updated);
}

// Hard delete — mst_employee.DeptCode has a NO ACTION FK to this table, which
// SQL Server rejects on its own the moment a department is actually
// referenced; we just surface that cleanly instead of guessing.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/reference/departments/[code]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "delete");
  if (denied) return denied;

  const { code } = await ctx.params;
  const existing = await prisma.refDepartment.findUnique({ where: { DeptCode: code } });
  if (!existing) return apiError(404, "DEPARTMENT_NOT_FOUND");

  try {
    await prisma.refDepartment.delete({ where: { DeptCode: code } });
  } catch {
    return apiError(409, "DEPARTMENT_IN_USE", "This department is linked to one or more employees and cannot be deleted");
  }

  await logAction(user.userId, "DELETE_DEPARTMENT", { targetTable: "ref_department", targetId: code });
  return apiSuccess({ ok: true });
}
