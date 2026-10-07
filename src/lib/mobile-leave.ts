import "server-only";
import { prisma } from "./prisma";
import { isLeaveTypeEligible } from "./leave";
import { getLeaveBalanceSummary } from "./leave-balance";

// Shared by GET /api/mobile/leave and the /mobile/leave Server Component
// (initial render) so both always return the same shape. `year` is Gregorian.
export async function getMobileLeaveData(employee: { EmpCode: string; EmployeeType: string }, year: number) {
  const [requests, balances, leaveTypes] = await Promise.all([
    prisma.trnLeaveRequest.findMany({
      where: { EmpCode: employee.EmpCode, StartDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
      include: { LeaveType: { select: { LeaveTypeName: true, RequireMedicalCert: true } } },
      orderBy: { StartDate: "desc" },
    }),
    getLeaveBalanceSummary(employee.EmpCode, year),
    prisma.mstLeaveType.findMany({ orderBy: { LeaveTypeCode: "asc" } }),
  ]);

  return {
    year,
    requests: requests.map((r) => ({
      leaveId: r.LeaveID,
      documentNo: r.DocumentNo,
      leaveTypeCode: r.LeaveTypeCode,
      leaveTypeName: r.LeaveType.LeaveTypeName,
      startDate: r.StartDate.toISOString(),
      endDate: r.EndDate.toISOString(),
      isFullDay: r.IsFullDay,
      hoursRequested: r.HoursRequested ? Number(r.HoursRequested) : null,
      totalDays: Number(r.TotalDays),
      status: r.Status,
      rejectReason: r.RejectReason,
      hasMedicalCert: r.HasMedicalCert,
      requireMedicalCert: r.LeaveType.RequireMedicalCert,
    })),
    balances,
    leaveTypes: leaveTypes
      .filter((t) => isLeaveTypeEligible(t.EligibleEmployeeType, employee.EmployeeType))
      .map((t) => ({ leaveTypeCode: t.LeaveTypeCode, leaveTypeName: t.LeaveTypeName, requireMedicalCert: t.RequireMedicalCert })),
  };
}

export type MobileLeaveData = Awaited<ReturnType<typeof getMobileLeaveData>>;

// Periods whose payroll has been sent for approval (trn_payroll_lock.IsLocked)
// AND that contain a transaction for this employee — the only ones an
// employee may see a payslip for.
export async function listViewablePayslipPeriods(empCode: string) {
  const transactions = await prisma.trnPayrollTransaction.findMany({
    where: { EmpCode: empCode, Period: { PayrollLocks: { some: { IsLocked: true } } } },
    select: { Period: { select: { PeriodID: true, PeriodYear: true, PeriodMonth: true, StartDate: true, EndDate: true, PayDate: true } } },
  });
  return transactions
    .map((t) => t.Period)
    .sort((a, b) => b.StartDate.getTime() - a.StartDate.getTime())
    .map((p) => ({ periodId: p.PeriodID, year: p.PeriodYear, month: p.PeriodMonth, startDate: p.StartDate.toISOString(), endDate: p.EndDate.toISOString(), payDate: p.PayDate.toISOString() }));
}
