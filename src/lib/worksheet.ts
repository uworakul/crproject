import "server-only";
import { prisma } from "./prisma";
import { Prisma } from "../../generated/prisma/client";

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

// REGULAR employees eligible for a site's worksheet in a given month
// (2026-09-21, extended for RESIGNED handling — shared by
// getOrCreateDraftWorksheet's initial pull and repullWorksheetEmployees'
// manual re-pull, so both use exactly the same eligibility rule). A usable
// daily rate must exist, in order of specificity: (1) the employee's own
// mst_employee.DailyRate, (2) this worksheet's Site+Position อัตรากำลังพล
// rate (mst_site_position_income, IncomeCode="01" ค่าแรง, RateBasis=DAILY —
// e.g. the user set ค่าแรง=500/day for ตำแหน่ง 114 at หน่วยงาน 201 through
// "หน่วยงาน (Site) -> จัดการตำแหน่ง" already, so that should be picked up
// here without also having to duplicate it in the Position-level fallback),
// (3) the Position's own generic "รายได้พื้นฐาน" (mst_position_income,
// same IncomeCode/RateBasis) for when neither the employee nor this
// specific site has a rate set. Only "01"/DAILY is read at any tier since
// Worksheet has no OT/allowance concept at all (just DailyRate × attendance
// PayMultiplier per day) — a MONTHLY rate wouldn't mean anything to
// Worksheet's per-day model, so it's deliberately ignored, not misapplied
// as a daily figure. Currently-employed statuses (ACTIVE/PROBATION/
// SUSPENDED) are always eligible; RESIGNED is eligible only for the
// worksheet covering their last month (ResignDate falls inside [1st, last
// day] of WorkYear/WorkMonth) so their final partial month's attendance can
// still be recorded; TERMINATED is never eligible (no equivalent "last
// active month" date field exists for it, unlike ResignDate). This
// EmployeeStatus check didn't exist before — the original query (built
// 2026-09-16, three days before EmployeeStatus grew beyond ACTIVE/RESIGNED)
// had no status filter at all, so RESIGNED/TERMINATED staff would have kept
// appearing on every new worksheet indefinitely.
async function findRegularEmployeesForWorksheet(
  siteCode: string,
  year: number,
  month: number,
): Promise<{ EmpCode: string; DailyRate: Prisma.Decimal; PositionCode: string | null }[]> {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const candidates = await prisma.mstEmployee.findMany({
    where: {
      DefaultSiteCode: siteCode,
      IsActive: true,
      OR: [{ EmployeeStatus: { notIn: ["RESIGNED", "TERMINATED"] } }, { EmployeeStatus: "RESIGNED", ResignDate: { gte: monthStart, lte: monthEnd } }],
    },
    select: { EmpCode: true, DailyRate: true, PositionCode: true },
  });

  const positionCodesNeedingFallback = [...new Set(candidates.filter((e) => e.DailyRate === null && e.PositionCode).map((e) => e.PositionCode as string))];
  const [siteRates, positionRates] = positionCodesNeedingFallback.length
    ? await Promise.all([
        prisma.mstSitePositionIncome.findMany({
          where: { IncomeCode: "01", RateBasis: "DAILY", SitePosition: { SiteCode: siteCode, PositionCode: { in: positionCodesNeedingFallback } } },
          select: { Amount: true, SitePosition: { select: { PositionCode: true } } },
        }),
        prisma.mstPositionIncome.findMany({
          where: { PositionCode: { in: positionCodesNeedingFallback }, IncomeCode: "01", RateBasis: "DAILY" },
          select: { PositionCode: true, Amount: true },
        }),
      ])
    : [[], []];
  const siteRateByPosition = new Map(siteRates.map((r) => [r.SitePosition.PositionCode, r.Amount]));
  const positionRateByPosition = new Map(positionRates.map((r) => [r.PositionCode, r.Amount]));

  return candidates
    .map((e) => ({
      EmpCode: e.EmpCode,
      DailyRate: e.DailyRate ?? (e.PositionCode ? (siteRateByPosition.get(e.PositionCode) ?? positionRateByPosition.get(e.PositionCode) ?? null) : null),
      PositionCode: e.PositionCode,
    }))
    .filter((e): e is { EmpCode: string; DailyRate: Prisma.Decimal; PositionCode: string | null } => e.DailyRate !== null);
}

// 3-tier rate fallback (employee's own DailyRate -> this worksheet's
// Site+Position อัตรากำลังพล -> the Position's generic "รายได้พื้นฐาน") —
// used both by findRegularEmployeesForWorksheet above (REGULAR auto-pull,
// always using the employee's own PositionCode) and directly by the SPARE
// add/edit endpoints (2026-09-21: a spare's position for THIS worksheet can
// differ entirely from their home mst_employee.PositionCode — "ตำแหน่ง
// ปัจจุบันเป็น รปภ แต่ไปเป็น คนสวน ในอีกหน่วยงานก็ได้" — so positionCode here
// is whatever was CHOSEN for this assignment, not necessarily the
// employee's own). siteCode is always the WORKSHEET's site, not the
// employee's DefaultSiteCode — matches what "อัตรากำลังพล" means: what this
// site pays for this position.
export async function resolveEffectiveDailyRate(siteCode: string, employeeDailyRate: Prisma.Decimal | null, positionCode: string | null): Promise<Prisma.Decimal | null> {
  if (employeeDailyRate) return employeeDailyRate;
  if (!positionCode) return null;
  const siteRate = await prisma.mstSitePositionIncome.findFirst({
    where: { IncomeCode: "01", RateBasis: "DAILY", SitePosition: { SiteCode: siteCode, PositionCode: positionCode } },
    select: { Amount: true },
  });
  if (siteRate) return siteRate.Amount;
  const positionRate = await prisma.mstPositionIncome.findFirst({
    where: { PositionCode: positionCode, IncomeCode: "01", RateBasis: "DAILY" },
    select: { Amount: true },
  });
  return positionRate?.Amount ?? null;
}

/**
 * GET /api/worksheets?site=&year=&month= semantics: find the one worksheet
 * for (site, year, month) — UNIQUE(SiteCode, WorkYear, WorkMonth) — or
 * create a DRAFT and auto-pull eligible REGULAR employees (see
 * findRegularEmployeesForWorksheet above), snapshotting the resolved daily
 * rate at add-time (FSD: rate must not silently change if the employee's
 * master rate — or the Position's รายได้พื้นฐาน fallback — changes later).
 * Employees with no usable rate at all (no DailyRate AND no Position base
 * rate) can't be snapshotted and are skipped — fill in DailyRate at Employee
 * Master (or set a รายได้พื้นฐาน rate on their Position), then use
 * repullWorksheetEmployees() below if the worksheet already exists.
 */
export async function getOrCreateDraftWorksheet(siteCode: string, year: number, month: number, userId: string) {
  const existing = await prisma.trnWorksheetHeader.findUnique({
    where: { SiteCode_WorkYear_WorkMonth: { SiteCode: siteCode, WorkYear: year, WorkMonth: month } },
  });
  if (existing) return existing.WorksheetID;

  const regulars = await findRegularEmployeesForWorksheet(siteCode, year, month);

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
        INSERT INTO trn_worksheet_detail (WorksheetID, EmpCode, EmpType, PositionCode, DailyRate, DisplayOrder, CreatedBy)
        VALUES (${id}, ${e.EmpCode}, 'REGULAR', ${e.PositionCode}, ${e.DailyRate}, ${i}, ${userId})
      `;
    }

    return id;
  });

  return worksheetId;
}

/**
 * "ดึงรายชื่อพนักงานอีกครั้ง" (2026-09-21) — re-runs the same eligibility
 * query getOrCreateDraftWorksheet used at creation, for an ALREADY-EXISTING
 * DRAFT worksheet that never auto-refreshes on its own otherwise (e.g. an
 * employee's DailyRate got filled in at Employee Master, or someone new was
 * assigned to this site, after the worksheet was first created empty).
 * Skips anyone already on the sheet (by EmpCode) — additive only, never
 * removes or touches an existing row. Caller (the route handler) is
 * responsible for the DRAFT-only / permission checks, same split as every
 * other mutating worksheet.ts function.
 */
export async function repullWorksheetEmployees(worksheetId: number, siteCode: string, year: number, month: number, userId: string): Promise<{ added: number }> {
  const [existing, candidates] = await Promise.all([
    prisma.trnWorksheetDetail.findMany({ where: { WorksheetID: worksheetId }, select: { EmpCode: true, DisplayOrder: true } }),
    findRegularEmployeesForWorksheet(siteCode, year, month),
  ]);
  const existingCodes = new Set(existing.map((d) => d.EmpCode));
  const toAdd = candidates.filter((e) => !existingCodes.has(e.EmpCode));
  if (toAdd.length === 0) return { added: 0 };

  let nextOrder = existing.reduce((max, d) => Math.max(max, d.DisplayOrder), -1) + 1;

  // Raw INSERT — same Prisma 7 / Unsupported("rowversion") workaround as
  // getOrCreateDraftWorksheet above.
  await prisma.$transaction(async (tx) => {
    for (const e of toAdd) {
      await tx.$executeRaw`
        INSERT INTO trn_worksheet_detail (WorksheetID, EmpCode, EmpType, PositionCode, DailyRate, DisplayOrder, CreatedBy)
        VALUES (${worksheetId}, ${e.EmpCode}, 'REGULAR', ${e.PositionCode}, ${e.DailyRate}, ${nextOrder}, ${userId})
      `;
      nextOrder++;
    }
  });

  return { added: toAdd.length };
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
          Position: { select: { PositionName: true } },
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
      positionCode: d.PositionCode,
      positionName: d.Position?.PositionName ?? null,
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
