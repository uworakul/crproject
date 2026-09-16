import "server-only";
import { prisma } from "./prisma";
import { Prisma } from "../../generated/prisma/client";

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

/**
 * GET /api/worksheets?site=&year=&month= semantics: find the one worksheet
 * for (site, year, month) — UNIQUE(SiteCode, WorkYear, WorkMonth) — or
 * create a DRAFT and auto-pull REGULAR employees from
 * mst_employee.DefaultSiteCode, snapshotting DailyRate at add-time (FSD:
 * rate must not silently change if the employee's master rate changes
 * later). Employees with no DailyRate set can't be snapshotted and are
 * skipped — Employee Master isn't built yet, so this can only happen with
 * incompletely-seeded data.
 */
export async function getOrCreateDraftWorksheet(siteCode: string, year: number, month: number, userId: string) {
  const existing = await prisma.trnWorksheetHeader.findUnique({
    where: { SiteCode_WorkYear_WorkMonth: { SiteCode: siteCode, WorkYear: year, WorkMonth: month } },
  });
  if (existing) return existing.WorksheetID;

  const regulars = await prisma.mstEmployee.findMany({
    where: { DefaultSiteCode: siteCode, IsActive: true, DailyRate: { not: null } },
    select: { EmpCode: true, DailyRate: true },
  });

  // Raw INSERT, not prisma.trnWorksheetHeader.create(): Prisma 7 omits
  // .create()/.upsert() entirely from the generated client for any model
  // with an Unsupported("rowversion") field (both trn_worksheet_header and
  // trn_worksheet_detail have RowVer) — find/update/delete are unaffected,
  // this is confined to the two INSERT call sites.
  const worksheetId = await prisma.$transaction(async (tx) => {
    const [{ WorksheetID: id }] = await tx.$queryRaw<{ WorksheetID: number }[]>`
      INSERT INTO trn_worksheet_header (SiteCode, WorkYear, WorkMonth, CreatedBy)
      OUTPUT INSERTED.WorksheetID
      VALUES (${siteCode}, ${year}, ${month}, ${userId})
    `;

    for (let i = 0; i < regulars.length; i++) {
      const e = regulars[i];
      await tx.$executeRaw`
        INSERT INTO trn_worksheet_detail (WorksheetID, EmpCode, EmpType, DailyRate, DisplayOrder)
        VALUES (${id}, ${e.EmpCode}, 'REGULAR', ${e.DailyRate}, ${i})
      `;
    }

    return id;
  });

  return worksheetId;
}

export async function getWorksheetDetail(worksheetId: number) {
  const header = await prisma.trnWorksheetHeader.findUnique({
    where: { WorksheetID: worksheetId },
    include: {
      Site: { select: { SiteName: true } },
      Details: {
        orderBy: { DisplayOrder: "asc" },
        include: {
          Employee: { select: { FullName: true } },
          DailyRecords: { select: { WorkDate: true, AttendCode: true, Remark: true } },
        },
      },
    },
  });
  if (!header) return null;

  const attendanceCodes = await prisma.mstAttendanceCode.findMany({
    where: { IsActive: true },
    orderBy: { SortOrder: "asc" },
  });
  const multiplierByCode = new Map(attendanceCodes.map((c) => [c.Code, c.PayMultiplier]));

  const totalDays = daysInMonth(header.WorkYear, header.WorkMonth);

  const details = header.Details.map((d) => {
    const dailyByDate = new Map(d.DailyRecords.map((r) => [r.WorkDate.getUTCDate(), r.AttendCode]));
    const days = Array.from({ length: totalDays }, (_, i) => {
      const dayNum = i + 1;
      const attendCode = dailyByDate.get(dayNum) ?? null;
      return { day: dayNum, attendCode };
    });

    const total = days.reduce((sum, day) => {
      if (!day.attendCode) return sum;
      const multiplier = multiplierByCode.get(day.attendCode);
      return multiplier ? sum.add(d.DailyRate.mul(multiplier)) : sum;
    }, new Prisma.Decimal(0));

    return {
      worksheetDetailId: d.WorksheetDetailID,
      empCode: d.EmpCode,
      empName: d.Employee.FullName,
      empType: d.EmpType,
      dailyRate: d.DailyRate,
      days,
      total,
    };
  });

  return {
    worksheetId: header.WorksheetID,
    siteCode: header.SiteCode,
    siteName: header.Site.SiteName,
    workYear: header.WorkYear,
    workMonth: header.WorkMonth,
    status: header.Status,
    createdBy: header.CreatedBy,
    createdDate: header.CreatedDate,
    submittedBy: header.SubmittedBy,
    submittedDate: header.SubmittedDate,
    approvedBy: header.ApprovedBy,
    approvedDate: header.ApprovedDate,
    rejectedBy: header.RejectedBy,
    rejectedDate: header.RejectedDate,
    rejectReason: header.RejectReason,
    attendanceCodes,
    details,
  };
}

interface ApproveFailure {
  reason: string;
  empCode?: string;
}

/**
 * Approve = recompute totals server-side (never trust client math) and
 * auto-post one trn_payroll_transaction row per employee, all inside one DB
 * transaction — if any employee is missing a matching sys_period, the whole
 * approve fails and the header stays SUBMITTED (per FSD: rollback, don't
 * leave a half-posted worksheet).
 *
 * NetPay = GrossWage here: tax/SSO/advance-loan deductions are the separate
 * Payroll Calculate module's job (not built yet), which is expected to
 * update these rows later — Worksheet only knows about attendance-derived
 * wage.
 */
export async function approveWorksheet(
  worksheetId: number,
  approvedBy: string,
): Promise<{ ok: true } | { ok: false; error: ApproveFailure }> {
  const header = await prisma.trnWorksheetHeader.findUnique({
    where: { WorksheetID: worksheetId },
    include: {
      Details: { include: { Employee: true, DailyRecords: true } },
    },
  });
  if (!header) return { ok: false, error: { reason: "WORKSHEET_NOT_FOUND" } };
  if (header.Status !== "SUBMITTED") {
    return { ok: false, error: { reason: "INVALID_STATUS_TRANSITION" } };
  }

  const attendanceCodes = await prisma.mstAttendanceCode.findMany();
  const multiplierByCode = new Map(attendanceCodes.map((c) => [c.Code, c.PayMultiplier]));

  const zero = new Prisma.Decimal(0);
  const postings: {
    empCode: string;
    periodId: number;
    workDays: Prisma.Decimal;
    doubleShiftDays: Prisma.Decimal;
    holidayDays: Prisma.Decimal;
    grossWage: Prisma.Decimal;
  }[] = [];

  for (const detail of header.Details) {
    const period = await prisma.sysPeriod.findFirst({
      where: {
        EmployeeType: detail.Employee.EmployeeType,
        PeriodYear: header.WorkYear,
        PeriodMonth: header.WorkMonth,
      },
    });
    if (!period) {
      return {
        ok: false,
        error: { reason: "PERIOD_NOT_FOUND", empCode: detail.EmpCode },
      };
    }

    let workDays = zero;
    let doubleShiftDays = zero;
    let holidayDays = zero;
    let grossWage = zero;

    for (const day of detail.DailyRecords) {
      if (!day.AttendCode) continue;
      const multiplier = multiplierByCode.get(day.AttendCode);
      if (multiplier === undefined) continue;

      grossWage = grossWage.add(detail.DailyRate.mul(multiplier));

      if (multiplier.equals(0)) holidayDays = holidayDays.add(1);
      else if (multiplier.equals(2)) doubleShiftDays = doubleShiftDays.add(1);
      else workDays = workDays.add(1);
    }

    postings.push({
      empCode: detail.EmpCode,
      periodId: period.PeriodID,
      workDays,
      doubleShiftDays,
      holidayDays,
      grossWage,
    });
  }

  await prisma.$transaction(async (tx) => {
    for (const p of postings) {
      await tx.trnPayrollTransaction.upsert({
        where: { EmpCode_PeriodID: { EmpCode: p.empCode, PeriodID: p.periodId } },
        update: {
          SiteCode: header.SiteCode,
          WorkDays: p.workDays,
          DoubleShiftDays: p.doubleShiftDays,
          HolidayDays: p.holidayDays,
          GrossWage: p.grossWage,
          NetPay: p.grossWage,
          SourceWorksheetID: header.WorksheetID,
        },
        create: {
          EmpCode: p.empCode,
          PeriodID: p.periodId,
          SiteCode: header.SiteCode,
          WorkDays: p.workDays,
          DoubleShiftDays: p.doubleShiftDays,
          HolidayDays: p.holidayDays,
          GrossWage: p.grossWage,
          NetPay: p.grossWage,
          SourceWorksheetID: header.WorksheetID,
        },
      });
    }

    await tx.trnWorksheetHeader.update({
      where: { WorksheetID: worksheetId },
      data: { Status: "APPROVED", ApprovedBy: approvedBy, ApprovedDate: new Date() },
    });
  });

  return { ok: true };
}
