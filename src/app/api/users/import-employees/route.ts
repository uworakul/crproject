import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { employeeScopeWhere } from "@/lib/employee-scope";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Every account created here is a Role EMPLOYEE self-service user (UserID =
// EmpCode) whose starting password is the employee's own ID card number
// (mst_employee.IDCardNo). EMPLOYEE users get the MOBILE menu by Role alone, so
// no sys_user_permission rows are needed. Employees without a usable ID card
// number (missing, or shorter than the 8-character password minimum) can't be
// imported — they're listed as disabled so the gap is visible.
const MIN_PASSWORD_LENGTH = 8;
const usablePassword = (idCardNo: string | null) => (idCardNo ?? "").trim();

// Employees who can still work and don't have a login yet (sys_user.UserID =
// EmpCode), limited to the companies/types the caller is allowed to see.
async function eligibleEmployees(user: NonNullable<Awaited<ReturnType<typeof verifySession>>>) {
  const existing = new Set((await prisma.sysUser.findMany({ select: { UserID: true } })).map((u) => u.UserID.toLowerCase()));
  const employees = await prisma.mstEmployee.findMany({
    where: { AND: [employeeScopeWhere(user), { EmployeeStatus: { in: ["ACTIVE", "PROBATION"] }, IsActive: true }] },
    select: { EmpCode: true, FullName: true, DefaultSiteCode: true, IDCardNo: true, Company: { select: { ShortName: true } } },
    orderBy: { EmpCode: "asc" },
  });
  return employees.filter((e) => !existing.has(e.EmpCode.toLowerCase()));
}

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "USER", "save");
  if (denied) return denied;
  const list = await eligibleEmployees(user);
  return apiSuccess(list.map((e) => ({ empCode: e.EmpCode, fullName: e.FullName, siteCode: e.DefaultSiteCode, company: e.Company?.ShortName ?? null, hasIdCard: usablePassword(e.IDCardNo).length >= MIN_PASSWORD_LENGTH })));
}

// POST { empCodes: string[] }
export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "USER", "save");
  if (denied) return denied;

  let body: { empCodes?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }
  if (!Array.isArray(body.empCodes) || body.empCodes.length === 0 || body.empCodes.length > 1000 || !body.empCodes.every((c) => typeof c === "string")) {
    return apiError(400, "INVALID_PARAMS", "empCodes must be a non-empty array of strings (max 1000)");
  }
  const wanted = new Set(body.empCodes as string[]);

  // Re-derived server-side: only employees that are still eligible are created.
  const eligible = (await eligibleEmployees(user)).filter((e) => wanted.has(e.EmpCode));
  const targets = eligible.filter((e) => usablePassword(e.IDCardNo).length >= MIN_PASSWORD_LENGTH);
  const noIdCard = eligible.length - targets.length;
  if (targets.length === 0) return apiSuccess({ created: 0, skipped: wanted.size, noIdCard });

  const siteCodes = new Set((await prisma.mstSite.findMany({ select: { SiteCode: true } })).map((s) => s.SiteCode));
  const hashes = await Promise.all(targets.map((e) => hashPassword(usablePassword(e.IDCardNo))));

  const res = await prisma.sysUser.createMany({
    data: targets.map((e, i) => ({
      UserID: e.EmpCode,
      PasswordHash: hashes[i],
      DisplayName: e.FullName,
      Role: "EMPLOYEE",
      DefaultSiteCode: e.DefaultSiteCode && siteCodes.has(e.DefaultSiteCode) ? e.DefaultSiteCode : null,
      CreatedBy: user.userId,
    })),
  });
  await logAction(user.userId, "IMPORT_USERS_FROM_EMPLOYEES", {
    targetTable: "sys_user",
    detail: `created ${res.count}: ${targets.map((e) => e.EmpCode).join(",")}`.slice(0, 500),
  });
  return apiSuccess({ created: res.count, skipped: wanted.size - res.count, noIdCard }, 201);
}
