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

  const departments = await prisma.refDepartment.findMany({ orderBy: { DeptCode: "asc" } });
  return apiSuccess(departments);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "save");
  if (denied) return denied;

  let body: { deptCode?: unknown; deptName?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const deptCode = typeof body.deptCode === "string" ? body.deptCode.trim() : "";
  const deptName = typeof body.deptName === "string" ? body.deptName.trim() : "";
  if (!deptCode || !deptName) return apiError(400, "INVALID_PARAMS", "deptCode and deptName are required");

  const existing = await prisma.refDepartment.findUnique({ where: { DeptCode: deptCode } });
  if (existing) return apiError(409, "DEPARTMENT_ALREADY_EXISTS", undefined, { deptCode });

  const created = await prisma.refDepartment.create({ data: { DeptCode: deptCode, DeptName: deptName } });
  await logAction(user.userId, "CREATE_DEPARTMENT", { targetTable: "ref_department", targetId: deptCode });
  return apiSuccess(created, 201);
}
