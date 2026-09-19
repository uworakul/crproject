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
        INSERT INTO trn_worksheet_detail (WorksheetID, EmpCode, EmpType, DailyRate, DisplayOrder, CreatedBy)
        VALUES (${id}, ${e.EmpCode}, 'REGULAR', ${e.DailyRate}, ${i}, ${userId})
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

  // Periods can now split a calendar month for the same EmployeeType (e.g.
  // 1-15 and 16-30, semi-monthly pay) — matched per day by which period's
  // [StartDate, EndDate] actually contains that day, not by WorkYear/Month.
  // One employee's worksheet can therefore post to more than one period.
  // Cached per EmployeeType since multiple Details usually share a type.
  const periodsByEmployeeType = new Map<string, { PeriodID: number; StartDate: Date; EndDate: Date }[]>();
  async function periodsForType(employeeType: string) {
    let list = periodsByEmployeeType.get(employeeType);
    if (!list) {
      list = await prisma.sysPeriod.findMany({
        where: { EmployeeType: employeeType },
        select: { PeriodID: true, StartDate: true, EndDate: true },
      });
      periodsByEmployeeType.set(employeeType, list);
    }
    return list;
  }

  for (const detail of header.Details) {
    const candidatePeriods = await periodsForType(detail.Employee.EmployeeType);

    // Group this employee's days by whichever period's date range contains
    // that day — a day matching no period fails the whole approve (same
    // atomicity guarantee as before: header stays SUBMITTED, nothing posts).
    const byPeriod = new Map<
      number,
      { workDays: Prisma.Decimal; doubleShiftDays: Prisma.Decimal; holidayDays: Prisma.Decimal; grossWage: Prisma.Decimal }
    >();

    for (const day of detail.DailyRecords) {
      if (!day.AttendCode) continue;
      const multiplier = multiplierByCode.get(day.AttendCode);
      if (multiplier === undefined) continue;

      const period = candidatePeriods.find((p) => p.StartDate <= day.WorkDate && p.EndDate >= day.WorkDate);
      if (!period) {
        return {
          ok: false,
          error: { reason: "PERIOD_NOT_FOUND", empCode: detail.EmpCode },
        };
      }

      const acc = byPeriod.get(period.PeriodID) ?? { workDays: zero, doubleShiftDays: zero, holidayDays: zero, grossWage: zero };
      acc.grossWage = acc.grossWage.add(detail.DailyRate.mul(multiplier));
      if (multiplier.equals(0)) acc.holidayDays = acc.holidayDays.add(1);
      else if (multiplier.equals(2)) acc.doubleShiftDays = acc.doubleShiftDays.add(1);
      else acc.workDays = acc.workDays.add(1);
      byPeriod.set(period.PeriodID, acc);
    }

    for (const [periodId, acc] of byPeriod) {
      // BR-032: a locked period is closed to further changes, including new
      // payroll postings from a Worksheet approve — added when the Payroll
      // module introduced trn_payroll_lock (this gap was flagged when
      // Worksheet was first built, before Lock existed).
      const lock = await prisma.trnPayrollLock.findFirst({ where: { PeriodID: periodId, IsLocked: true } });
      if (lock) {
        return {
          ok: false,
          error: { reason: "PERIOD_LOCKED", empCode: detail.EmpCode },
        };
      }

      postings.push({ empCode: detail.EmpCode, periodId, ...acc });
    }
  }

  // If a prior approve of this worksheet posted to some (employee, period)
  // pair that no longer has any matching day this time (e.g. all that
  // employee's days were cleared and the worksheet re-approved), that old
  // posting would otherwise be left stale instead of reflecting the edit —
  // zero it out explicitly rather than silently skipping it.
  const postedKeys = new Set(postings.map((p) => `${p.empCode}|${p.periodId}`));
  const priorPostings = await prisma.trnPayrollTransaction.findMany({
    where: { SourceWorksheetID: worksheetId },
    select: { EmpCode: true, PeriodID: true },
  });
  for (const prior of priorPostings) {
    const key = `${prior.EmpCode}|${prior.PeriodID}`;
    if (!postedKeys.has(key)) {
      postings.push({ empCode: prior.EmpCode, periodId: prior.PeriodID, workDays: zero, doubleShiftDays: zero, holidayDays: zero, grossWage: zero });
      postedKeys.add(key);
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const p of postings) {
      // On re-approve, GrossWage may change — any previously Calculate'd
      // TaxWithheld/SSOAmount are now stale, so they're reset to 0 (BR-030:
      // "สามารถคำนวณซ้ำได้ตลอด" — re-run Calculate afterward). Manually
      // entered fields from the Transaction screen (allowances/OT/manual
      // deductions/other income) are preserved and folded back into NetPay
      // rather than discarded.
      const existing = await tx.trnPayrollTransaction.findUnique({ where: { EmpCode_PeriodID: { EmpCode: p.empCode, PeriodID: p.periodId } } });
      const netPay = existing
        ? p.grossWage
            .sub(existing.AdvanceDeduct)
            .sub(existing.LoanDeduct)
            .sub(existing.TrainingDeduct)
            .sub(existing.UniformDeduct)
            .add(existing.OtherIncome)
            .sub(existing.OtherDeduction)
        : p.grossWage;

      await tx.trnPayrollTransaction.upsert({
        where: { EmpCode_PeriodID: { EmpCode: p.empCode, PeriodID: p.periodId } },
        update: {
          SiteCode: header.SiteCode,
          WorkDays: p.workDays,
          DoubleShiftDays: p.doubleShiftDays,
          HolidayDays: p.holidayDays,
          GrossWage: p.grossWage,
          TaxWithheld: 0,
          SSOAmount: 0,
          NetPay: netPay,
          SourceWorksheetID: header.WorksheetID,
          UpdatedBy: approvedBy,
          UpdatedDate: new Date(),
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
          CreatedBy: approvedBy,
        },
      });
    }

    await tx.trnWorksheetHeader.update({
      where: { WorksheetID: worksheetId },
      data: { Status: "APPROVED", ApprovedBy: approvedBy, ApprovedDate: new Date(), UpdatedBy: approvedBy, UpdatedDate: new Date() },
    });
  });

  return { ok: true };
}

/**
 * Cancel an approval (2026-09-19) — the reverse of approveWorksheet(): zero
 * out every (employee, period) posting this worksheet made (WorkDays/
 * DoubleShiftDays/HolidayDays/GrossWage/TaxWithheld/SSOAmount -> 0, NetPay
 * recomputed from whatever manually-entered fields survive), same
 * "zero rather than delete" convention approveWorksheet() already uses for
 * stale postings — a Payroll Calculate may have already touched allowances/
 * OT/manual deductions on that row, and those aren't this function's to
 * discard. Header goes back to DRAFT (same destination as reject) so the
 * grid is immediately editable again — re-approving means walking the full
 * DRAFT -> SUBMITTED -> APPROVED cycle again, same as any other correction.
 * Blocked (whole thing, atomically) if any affected period is already
 * locked, mirroring the same rule approveWorksheet() enforces.
 */
export async function unapproveWorksheet(worksheetId: number, unapprovedBy: string): Promise<{ ok: true } | { ok: false; error: ApproveFailure }> {
  const header = await prisma.trnWorksheetHeader.findUnique({ where: { WorksheetID: worksheetId } });
  if (!header) return { ok: false, error: { reason: "WORKSHEET_NOT_FOUND" } };
  if (header.Status !== "APPROVED") {
    return { ok: false, error: { reason: "INVALID_STATUS_TRANSITION" } };
  }

  const postings = await prisma.trnPayrollTransaction.findMany({ where: { SourceWorksheetID: worksheetId } });

  for (const p of postings) {
    const lock = await prisma.trnPayrollLock.findFirst({ where: { PeriodID: p.PeriodID, IsLocked: true } });
    if (lock) {
      return { ok: false, error: { reason: "PERIOD_LOCKED", empCode: p.EmpCode } };
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const p of postings) {
      const netPay = new Prisma.Decimal(0)
        .sub(p.AdvanceDeduct)
        .sub(p.LoanDeduct)
        .sub(p.TrainingDeduct)
        .sub(p.UniformDeduct)
        .add(p.OtherIncome)
        .sub(p.OtherDeduction);

      await tx.trnPayrollTransaction.update({
        where: { EmpCode_PeriodID: { EmpCode: p.EmpCode, PeriodID: p.PeriodID } },
        data: {
          WorkDays: 0,
          DoubleShiftDays: 0,
          HolidayDays: 0,
          GrossWage: 0,
          TaxWithheld: 0,
          SSOAmount: 0,
          NetPay: netPay,
          UpdatedBy: unapprovedBy,
          UpdatedDate: new Date(),
        },
      });
    }

    await tx.trnWorksheetHeader.update({
      where: { WorksheetID: worksheetId },
      data: { Status: "DRAFT", ApprovedBy: null, ApprovedDate: null, UpdatedBy: unapprovedBy, UpdatedDate: new Date() },
    });
  });

  return { ok: true };
}
