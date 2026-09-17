import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "LEAVE_REQUEST", "read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const empCode = searchParams.get("empCode");
  const year = Number(searchParams.get("year"));
  if (!empCode || !Number.isInteger(year)) return apiError(400, "INVALID_PARAMS", "empCode and year are required");

  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND");

  const leaveTypes = await prisma.mstLeaveType.findMany({ orderBy: { LeaveTypeCode: "asc" } });
  const balances = await prisma.mstEmployeeLeaveBalance.findMany({ where: { EmpCode: empCode, Year: year } });
  const balanceByType = new Map(balances.map((b) => [b.LeaveTypeCode, b]));

  // One row per leave type even if no balance has been set yet (Entitled=0) —
  // the Balance screen edits all types for an employee/year in one place.
  const result = leaveTypes.map((t) => {
    const b = balanceByType.get(t.LeaveTypeCode);
    return {
      leaveTypeCode: t.LeaveTypeCode,
      leaveTypeName: t.LeaveTypeName,
      maxDaysPerYear: t.MaxDaysPerYear,
      entitled: b?.Entitled.toString() ?? "0",
      used: b?.Used.toString() ?? "0",
      remaining: b?.Remaining.toString() ?? "0",
    };
  });

  return apiSuccess(result);
}

// Sets Entitled for (EmpCode, LeaveTypeCode, Year); Used is only ever
// touched by Leave approve/reject, never here — Remaining is kept as
// Entitled - Used, mirroring mst_employee_quota's derived-field pattern.
export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "LEAVE_REQUEST", "save");
  if (denied) return denied;

  let body: { empCode?: unknown; year?: unknown; entries?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const empCode = typeof body.empCode === "string" ? body.empCode.trim() : "";
  const year = Number(body.year);
  if (!empCode || !Number.isInteger(year)) return apiError(400, "INVALID_PARAMS", "empCode and year are required");

  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } });
  if (!employee) return apiError(404, "EMPLOYEE_NOT_FOUND");

  if (!Array.isArray(body.entries)) return apiError(400, "INVALID_PARAMS", "entries must be an array");
  const entries = body.entries as { leaveTypeCode?: unknown; entitled?: unknown }[];

  const leaveTypes = await prisma.mstLeaveType.findMany({ select: { LeaveTypeCode: true } });
  const validCodes = new Set(leaveTypes.map((t) => t.LeaveTypeCode));

  for (const e of entries) {
    if (typeof e.leaveTypeCode !== "string" || !validCodes.has(e.leaveTypeCode)) {
      return apiError(400, "VALIDATION_FAILED", "Unknown leaveTypeCode", { leaveTypeCode: e.leaveTypeCode });
    }
    const n = Number(e.entitled);
    if (!Number.isFinite(n) || n < 0) return apiError(400, "VALIDATION_FAILED", "entitled must be a non-negative number");
  }

  await prisma.$transaction(
    entries.map((e) => {
      const leaveTypeCode = e.leaveTypeCode as string;
      const entitled = Number(e.entitled);
      return prisma.mstEmployeeLeaveBalance.upsert({
        where: { EmpCode_LeaveTypeCode_Year: { EmpCode: empCode, LeaveTypeCode: leaveTypeCode, Year: year } },
        update: { Entitled: entitled },
        create: { EmpCode: empCode, LeaveTypeCode: leaveTypeCode, Year: year, Entitled: entitled, Used: 0, Remaining: entitled },
      });
    }),
  );

  // Recompute Remaining = Entitled - Used for every row just touched (Used
  // may already be nonzero if leave was approved before the balance was set).
  const rows = await prisma.mstEmployeeLeaveBalance.findMany({ where: { EmpCode: empCode, Year: year } });
  await prisma.$transaction(
    rows.map((r) => prisma.mstEmployeeLeaveBalance.update({ where: { BalanceID: r.BalanceID }, data: { Remaining: r.Entitled.sub(r.Used) } })),
  );

  await logAction(user.userId, "UPDATE_LEAVE_BALANCE", { targetTable: "mst_employee_leave_balance", targetId: `${empCode}-${year}` });

  const updated = await prisma.mstEmployeeLeaveBalance.findMany({ where: { EmpCode: empCode, Year: year } });
  return apiSuccess(updated);
}
