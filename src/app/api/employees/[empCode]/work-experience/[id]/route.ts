import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/employees/[empCode]/work-experience/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "save");
  if (denied) return denied;

  const { empCode, id } = await ctx.params;
  const workExperienceId = Number(id);
  if (!Number.isInteger(workExperienceId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.mstEmployeeWorkExperience.findUnique({ where: { WorkExperienceID: workExperienceId } });
  if (!existing || existing.EmpCode !== empCode) return apiError(404, "WORK_EXPERIENCE_NOT_FOUND");

  let body: {
    companyName?: unknown;
    positionName?: unknown;
    location?: unknown;
    responsibility?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    resignReason?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  let startDate: Date | null | undefined;
  if (body.startDate === null || body.startDate === "") startDate = null;
  else if (typeof body.startDate === "string") {
    startDate = new Date(body.startDate);
    if (Number.isNaN(startDate.getTime())) return apiError(400, "VALIDATION_FAILED", "startDate is invalid");
  }
  let endDate: Date | null | undefined;
  if (body.endDate === null || body.endDate === "") endDate = null;
  else if (typeof body.endDate === "string") {
    endDate = new Date(body.endDate);
    if (Number.isNaN(endDate.getTime())) return apiError(400, "VALIDATION_FAILED", "endDate is invalid");
  }

  const updated = await prisma.mstEmployeeWorkExperience.update({
    where: { WorkExperienceID: workExperienceId },
    data: {
      CompanyName: typeof body.companyName === "string" && body.companyName.trim() ? body.companyName.trim() : undefined,
      PositionName: body.positionName === null ? null : typeof body.positionName === "string" ? body.positionName.trim() || null : undefined,
      Location: body.location === null ? null : typeof body.location === "string" ? body.location.trim() || null : undefined,
      Responsibility:
        body.responsibility === null ? null : typeof body.responsibility === "string" ? body.responsibility.trim() || null : undefined,
      StartDate: startDate,
      EndDate: endDate,
      ResignReason: body.resignReason === null ? null : typeof body.resignReason === "string" ? body.resignReason.trim() || null : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_EMPLOYEE_WORK_EXPERIENCE", { targetTable: "mst_employee_work_experience", targetId: id });
  return apiSuccess(updated);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/employees/[empCode]/work-experience/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "delete");
  if (denied) return denied;

  const { empCode, id } = await ctx.params;
  const workExperienceId = Number(id);
  if (!Number.isInteger(workExperienceId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.mstEmployeeWorkExperience.findUnique({ where: { WorkExperienceID: workExperienceId } });
  if (!existing || existing.EmpCode !== empCode) return apiError(404, "WORK_EXPERIENCE_NOT_FOUND");

  await prisma.mstEmployeeWorkExperience.delete({ where: { WorkExperienceID: workExperienceId } });
  await logAction(user.userId, "DELETE_EMPLOYEE_WORK_EXPERIENCE", { targetTable: "mst_employee_work_experience", targetId: id });
  return apiSuccess({ ok: true });
}
