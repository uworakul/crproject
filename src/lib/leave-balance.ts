import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "../../generated/prisma/client";
import { isLeaveTypeEligible, wholeYearsOfService } from "./leave";

export interface LeaveBalanceEntry {
  leaveTypeCode: string;
  leaveTypeName: string;
  eligible: boolean;
  basedOnTenure: boolean;
  entitled: string;
  used: string;
  remaining: string;
}

async function computeTenureEntitledDays(
  leaveType: { LeaveTypeCode: string; TenureCountFrom: string | null },
  employee: { StartDate: Date; ProbationPassDate: Date | null },
  asOf: Date,
): Promise<Prisma.Decimal> {
  const baseDate = leaveType.TenureCountFrom === "PROBATION_PASS_DATE" ? employee.ProbationPassDate : employee.StartDate;
  if (!baseDate) return new Prisma.Decimal(0);
  const years = wholeYearsOfService(baseDate, asOf);
  const tier = await prisma.mstLeaveTenureTier.findFirst({
    where: { LeaveTypeCode: leaveType.LeaveTypeCode, MinYearsOfService: { lte: years } },
    orderBy: { MinYearsOfService: "desc" },
  });
  return tier ? tier.EntitledDays : new Prisma.Decimal(0);
}

// Entitlement/Used/Remaining for every mst_leave_type, computed live —
// mst_employee_leave_balance is no longer the source of truth (2026-09-21,
// see CLAUDE.md). Entitled = MaxDaysPerYear (same for every eligible
// employee), or looked up from mst_leave_tenure_tier when BasedOnTenure=true.
// Used = sum of TotalDays across that EmpCode+LeaveTypeCode's APPROVED
// requests whose StartDate falls in `year`. "eligible" reflects
// EligibleEmployeeType — ineligible types show entitled=0 rather than being
// omitted, so the UI can still list every leave type consistently.
export async function getLeaveBalanceSummary(empCode: string, year: number): Promise<LeaveBalanceEntry[]> {
  const employee = await prisma.mstEmployee.findUnique({
    where: { EmpCode: empCode },
    select: { EmployeeType: true, StartDate: true, ProbationPassDate: true },
  });
  if (!employee) return [];

  const leaveTypes = await prisma.mstLeaveType.findMany({ orderBy: { LeaveTypeCode: "asc" } });

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const approvedRequests = await prisma.trnLeaveRequest.findMany({
    where: { EmpCode: empCode, Status: "APPROVED", StartDate: { gte: yearStart, lt: yearEnd } },
    select: { LeaveTypeCode: true, TotalDays: true },
  });
  const usedByType = new Map<string, Prisma.Decimal>();
  for (const r of approvedRequests) {
    usedByType.set(r.LeaveTypeCode, (usedByType.get(r.LeaveTypeCode) ?? new Prisma.Decimal(0)).add(r.TotalDays));
  }

  // Entitlement is fixed "as of Jan 1 of `year`" — an assumption, not
  // confirmed by the user (see wholeYearsOfService in src/lib/leave.ts) —
  // so it stays constant across every request filed within the same year.
  const asOf = yearStart;

  const entries: LeaveBalanceEntry[] = [];
  for (const t of leaveTypes) {
    const eligible = isLeaveTypeEligible(t.EligibleEmployeeType, employee.EmployeeType);
    const entitled = eligible
      ? t.BasedOnTenure
        ? await computeTenureEntitledDays(t, employee, asOf)
        : new Prisma.Decimal(t.MaxDaysPerYear)
      : new Prisma.Decimal(0);
    const used = usedByType.get(t.LeaveTypeCode) ?? new Prisma.Decimal(0);
    const remainingRaw = entitled.sub(used);
    entries.push({
      leaveTypeCode: t.LeaveTypeCode,
      leaveTypeName: t.LeaveTypeName,
      eligible,
      basedOnTenure: t.BasedOnTenure,
      entitled: entitled.toString(),
      used: used.toString(),
      remaining: (remainingRaw.lt(0) ? new Prisma.Decimal(0) : remainingRaw).toString(),
    });
  }
  return entries;
}

export async function getLeaveBalanceForType(empCode: string, leaveTypeCode: string, year: number): Promise<LeaveBalanceEntry | null> {
  const all = await getLeaveBalanceSummary(empCode, year);
  return all.find((e) => e.leaveTypeCode === leaveTypeCode) ?? null;
}
