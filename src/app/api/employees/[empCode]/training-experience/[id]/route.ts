import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/employees/[empCode]/training-experience/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "save");
  if (denied) return denied;

  const { empCode, id } = await ctx.params;
  const trainingExperienceId = Number(id);
  if (!Number.isInteger(trainingExperienceId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.mstEmployeeTrainingExperience.findUnique({ where: { TrainingExperienceID: trainingExperienceId } });
  if (!existing || existing.EmpCode !== empCode) return apiError(404, "TRAINING_EXPERIENCE_NOT_FOUND");

  let body: {
    organization?: unknown;
    location?: unknown;
    duration?: unknown;
    topic?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    certificateNo?: unknown;
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

  const updated = await prisma.mstEmployeeTrainingExperience.update({
    where: { TrainingExperienceID: trainingExperienceId },
    data: {
      Organization: typeof body.organization === "string" && body.organization.trim() ? body.organization.trim() : undefined,
      Location: body.location === null ? null : typeof body.location === "string" ? body.location.trim() || null : undefined,
      Duration: body.duration === null ? null : typeof body.duration === "string" ? body.duration.trim() || null : undefined,
      Topic: body.topic === null ? null : typeof body.topic === "string" ? body.topic.trim() || null : undefined,
      StartDate: startDate,
      EndDate: endDate,
      CertificateNo: body.certificateNo === null ? null : typeof body.certificateNo === "string" ? body.certificateNo.trim() || null : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_EMPLOYEE_TRAINING_EXPERIENCE", { targetTable: "mst_employee_training_experience", targetId: id });
  return apiSuccess(updated);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/employees/[empCode]/training-experience/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "delete");
  if (denied) return denied;

  const { empCode, id } = await ctx.params;
  const trainingExperienceId = Number(id);
  if (!Number.isInteger(trainingExperienceId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.mstEmployeeTrainingExperience.findUnique({ where: { TrainingExperienceID: trainingExperienceId } });
  if (!existing || existing.EmpCode !== empCode) return apiError(404, "TRAINING_EXPERIENCE_NOT_FOUND");

  await prisma.mstEmployeeTrainingExperience.delete({ where: { TrainingExperienceID: trainingExperienceId } });
  await logAction(user.userId, "DELETE_EMPLOYEE_TRAINING_EXPERIENCE", { targetTable: "mst_employee_training_experience", targetId: id });
  return apiSuccess({ ok: true });
}
