import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/employees/[empCode]/training-experience">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "read");
  if (denied) return denied;

  const { empCode } = await ctx.params;
  const rows = await prisma.mstEmployeeTrainingExperience.findMany({ where: { EmpCode: empCode }, orderBy: { StartDate: "desc" } });
  return apiSuccess(rows);
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/employees/[empCode]/training-experience">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "save");
  if (denied) return denied;

  const { empCode } = await ctx.params;
  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND");

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

  const organization = typeof body.organization === "string" ? body.organization.trim() : "";
  if (!organization) return apiError(400, "INVALID_PARAMS", "organization is required");

  const startDate = typeof body.startDate === "string" && body.startDate ? new Date(body.startDate) : undefined;
  const endDate = typeof body.endDate === "string" && body.endDate ? new Date(body.endDate) : undefined;
  if (startDate && Number.isNaN(startDate.getTime())) return apiError(400, "VALIDATION_FAILED", "startDate is invalid");
  if (endDate && Number.isNaN(endDate.getTime())) return apiError(400, "VALIDATION_FAILED", "endDate is invalid");

  const created = await prisma.mstEmployeeTrainingExperience.create({
    data: {
      EmpCode: empCode,
      Organization: organization,
      Location: typeof body.location === "string" ? body.location.trim() || null : null,
      Duration: typeof body.duration === "string" ? body.duration.trim() || null : null,
      Topic: typeof body.topic === "string" ? body.topic.trim() || null : null,
      StartDate: startDate,
      EndDate: endDate,
      CertificateNo: typeof body.certificateNo === "string" ? body.certificateNo.trim() || null : null,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "CREATE_EMPLOYEE_TRAINING_EXPERIENCE", {
    targetTable: "mst_employee_training_experience",
    targetId: String(created.TrainingExperienceID),
  });
  return apiSuccess(created, 201);
}
