import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/employees/[empCode]/work-experience">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "read");
  if (denied) return denied;

  const { empCode } = await ctx.params;
  const rows = await prisma.mstEmployeeWorkExperience.findMany({ where: { EmpCode: empCode }, orderBy: { StartDate: "desc" } });
  return apiSuccess(rows);
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/employees/[empCode]/work-experience">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "save");
  if (denied) return denied;

  const { empCode } = await ctx.params;
  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND");

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

  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  if (!companyName) return apiError(400, "INVALID_PARAMS", "companyName is required");

  const startDate = typeof body.startDate === "string" && body.startDate ? new Date(body.startDate) : undefined;
  const endDate = typeof body.endDate === "string" && body.endDate ? new Date(body.endDate) : undefined;
  if (startDate && Number.isNaN(startDate.getTime())) return apiError(400, "VALIDATION_FAILED", "startDate is invalid");
  if (endDate && Number.isNaN(endDate.getTime())) return apiError(400, "VALIDATION_FAILED", "endDate is invalid");

  const created = await prisma.mstEmployeeWorkExperience.create({
    data: {
      EmpCode: empCode,
      CompanyName: companyName,
      PositionName: typeof body.positionName === "string" ? body.positionName.trim() || null : null,
      Location: typeof body.location === "string" ? body.location.trim() || null : null,
      Responsibility: typeof body.responsibility === "string" ? body.responsibility.trim() || null : null,
      StartDate: startDate,
      EndDate: endDate,
      ResignReason: typeof body.resignReason === "string" ? body.resignReason.trim() || null : null,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "CREATE_EMPLOYEE_WORK_EXPERIENCE", {
    targetTable: "mst_employee_work_experience",
    targetId: String(created.WorkExperienceID),
  });
  return apiSuccess(created, 201);
}
