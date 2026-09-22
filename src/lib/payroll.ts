import "server-only";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "./prisma";

// --- Withholding tax + SSO calculation ---------------------------------
//
// Approved with the user 2026-09-17 (no formula is specified anywhere in
// the FSD/BRD/DB Design — those documents describe the LEGACY system for
// reference only, per FSD §9.1 — and mst_employee has no marital-status or
// dependent-count field to support SPOUSE/CHILD deductions):
//
//   AnnualGross = GrossWage(this period) * 12
//   TaxableAnnual = max(0, AnnualGross - PERSONAL deduction from ref_deduction_rate)
//   AnnualTax = progressive sum over ref_tax_bracket for the period's year
//   TaxWithheld(this period) = AnnualTax / 12
//
// This intentionally excludes the separate 50%-of-income/100,000-cap
// "expense" deduction and any SPOUSE/CHILD/etc. allowances — only the flat
// PERSONAL deduction applies, uniformly, to every employee. Real 2026 rates
// (both tax brackets and the flat PERSONAL amount) were verified via
// WebSearch, not invented — see prisma/seed.ts for sources/rationale.
//
// SSO: base = clamp(GrossWage, MinBase, MaxBase); SSOAmount = base * EmployeeRate.
// This formula IS implied directly by the ref_sso_base column shapes
// (Min/MaxBase + EmployeeRate), unlike the tax formula which had to be
// decided with the user.

export class MissingRateDataError extends Error {
  constructor(public readonly kind: "TAX_BRACKET" | "SSO_BASE" | "WELFARE_FUND", public readonly year: number) {
    super(`No ${kind} rows found for year ${year}`);
  }
}

export async function calculateTaxWithheld(grossWage: Prisma.Decimal, year: number): Promise<Prisma.Decimal> {
  const brackets = await prisma.refTaxBracket.findMany({ where: { EffectiveYear: year }, orderBy: { IncomeFrom: "asc" } });
  if (brackets.length === 0) throw new MissingRateDataError("TAX_BRACKET", year);

  const personalDeduction = await prisma.refDeductionRate.findUnique({ where: { DeductionCode: "PERSONAL" } });
  const deduction = personalDeduction && personalDeduction.EffectiveYear === year ? personalDeduction.MaxAmount : new Prisma.Decimal(0);

  const annualGross = grossWage.mul(12);
  const taxableAnnual = Prisma.Decimal.max(0, annualGross.sub(deduction));

  let annualTax = new Prisma.Decimal(0);
  for (const bracket of brackets) {
    if (taxableAnnual.lte(bracket.IncomeFrom)) continue;
    const bandTop = Prisma.Decimal.min(taxableAnnual, bracket.IncomeTo);
    const bandAmount = bandTop.sub(bracket.IncomeFrom);
    if (bandAmount.lte(0)) continue;
    annualTax = annualTax.add(bandAmount.mul(bracket.TaxRate));
  }

  return annualTax.div(12).toDecimalPlaces(2);
}

export async function calculateSso(grossWage: Prisma.Decimal, year: number): Promise<Prisma.Decimal> {
  const rate = await prisma.refSsoBase.findFirst({ where: { EffectiveYear: year } });
  if (!rate) throw new MissingRateDataError("SSO_BASE", year);

  const base = Prisma.Decimal.max(rate.MinBase, Prisma.Decimal.min(grossWage, rate.MaxBase));
  return base.mul(rate.EmployeeRate).toDecimalPlaces(2);
}

// กองทุนสงเคราะห์พนักงาน (2026-09-21, "คำนวณเงินได้ประจำงวด") — same shape as
// SSO (rate x base) but ref_welfare_fund has no MinBase/MaxBase clamp (by
// design, see CLAUDE.md), so base is GrossWage directly. Same "fail loud,
// don't silently compute 0" convention as Tax/SSO if no rate row exists for
// the period's year.
export async function calculateWelfareFund(grossWage: Prisma.Decimal, year: number): Promise<Prisma.Decimal> {
  const rate = await prisma.refWelfareFund.findFirst({ where: { EffectiveYear: year } });
  if (!rate) throw new MissingRateDataError("WELFARE_FUND", year);

  return grossWage.mul(rate.EmployeeRate).toDecimalPlaces(2);
}

export interface InstallmentDeductionLine {
  debtId: number;
  code: string;
  label: string;
  amount: Prisma.Decimal; // this period's deduction = min(DeductPerPeriod, RemainingAmount)
  remainingAmount: Prisma.Decimal; // balance BEFORE this period's deduction (for display only)
}

// รายการหักที่กำหนดไว้ใน ref_deduction_type ว่าเป็น "หักเป็นงวด" (IsInstallment)
// ที่ยังมียอดคงค้างเหลืออยู่จริงสำหรับพนักงานคนนี้ (2026-09-21, "คำนวณเงินได้
// ประจำงวด") — a LIVE preview read fresh from inv_employee_debt every time
// it's called (by both Calculate and the display endpoint), so re-running
// Calculate always reflects the current outstanding balance. Deliberately
// does NOT write back to inv_employee_debt.RemainingAmount anywhere — per
// the user (2026-09-21), that only happens at a future approval/commit step
// that doesn't exist yet; Calculate is re-runnable (BR-030) and the
// approver can still reject/recalculate, so nothing here may be committed.
export async function getOpenInstallmentDeductions(empCode: string): Promise<InstallmentDeductionLine[]> {
  const debts = await prisma.invEmployeeDebt.findMany({
    where: {
      EmpCode: empCode,
      Status: "OPEN",
      RemainingAmount: { gt: 0 },
      DeductionCode: { not: null },
      DeductPerPeriod: { not: null },
      DeductionType: { IsInstallment: true },
    },
    include: { DeductionType: { select: { DeductionCode: true, DeductionName: true } } },
  });

  return debts
    .filter((d) => d.DeductPerPeriod && d.DeductPerPeriod.gt(0))
    .map((d) => ({
      debtId: d.DebtID,
      code: d.DeductionCode!,
      label: d.DeductionType?.DeductionName ?? d.DeductionCode!,
      amount: Prisma.Decimal.min(d.DeductPerPeriod!, d.RemainingAmount),
      remainingAmount: d.RemainingAmount,
    }));
}

function computeNetPay(tx: {
  GrossWage: Prisma.Decimal;
  TaxWithheld: Prisma.Decimal;
  SSOAmount: Prisma.Decimal;
  WelfareFundAmount: Prisma.Decimal;
  InstallmentDeduct: Prisma.Decimal;
  AdvanceDeduct: Prisma.Decimal;
  LoanDeduct: Prisma.Decimal;
  TrainingDeduct: Prisma.Decimal;
  UniformDeduct: Prisma.Decimal;
  OtherIncome: Prisma.Decimal;
  OtherDeduction: Prisma.Decimal;
}): Prisma.Decimal {
  return tx.GrossWage.sub(tx.TaxWithheld)
    .sub(tx.SSOAmount)
    .sub(tx.WelfareFundAmount)
    .sub(tx.InstallmentDeduct)
    .sub(tx.AdvanceDeduct)
    .sub(tx.LoanDeduct)
    .sub(tx.TrainingDeduct)
    .sub(tx.UniformDeduct)
    .add(tx.OtherIncome)
    .sub(tx.OtherDeduction);
}

export interface CalculateResult {
  employeeCount: number;
  totalAmount: Prisma.Decimal;
}

export interface CalculateFilters {
  empCodeFrom?: string;
  empCodeTo?: string;
  companyCode?: string; // mst_employee.CompanyCode — "คำนวณเฉพาะบริษัท" (2026-09-21, คำนวณเงินได้ประจำงวด)
  deptCode?: string; // mst_employee.DeptCode — "คำนวณเฉพาะแผนก"
  empCode?: string; // single specific employee — "รหัสพนักงานเฉพาะคน"
}

// BR-030: select EmployeeType + Period (+ optional employee code range),
// "สามารถคำนวณซ้ำได้ตลอด" (re-runnable at will) — each run fully
// recomputes TaxWithheld/SSOAmount/NetPay from the current GrossWage and
// whatever Advance/Loan/Training/Uniform/Other fields are already on the
// row (those are edited separately on the Transaction screen, not owned by
// Calculate itself). Filters are AND-combined — e.g. companyCode + deptCode
// together narrows to that department within that company; empCode (single)
// takes precedence as an exact match alongside whatever else is set.
export async function runPayrollCalculate(
  periodId: number,
  calculatedBy: string,
  filters: CalculateFilters = {},
  documentNo?: string | null,
): Promise<CalculateResult> {
  const period = await prisma.sysPeriod.findUnique({ where: { PeriodID: periodId } });
  if (!period) throw new Error("PERIOD_NOT_FOUND");

  const lock = await prisma.trnPayrollLock.findFirst({ where: { PeriodID: periodId, IsLocked: true } });
  if (lock) throw new Error("PERIOD_LOCKED");

  const { empCodeFrom, empCodeTo, companyCode, deptCode, empCode } = filters;
  const transactions = await prisma.trnPayrollTransaction.findMany({
    where: {
      PeriodID: periodId,
      ...(empCodeFrom ? { EmpCode: { gte: empCodeFrom } } : {}),
      ...(empCodeTo ? { EmpCode: { lte: empCodeTo } } : {}),
      ...(empCode ? { EmpCode: empCode } : {}),
      ...(companyCode || deptCode
        ? { Employee: { ...(companyCode ? { CompanyCode: companyCode } : {}), ...(deptCode ? { DeptCode: deptCode } : {}) } }
        : {}),
    },
  });

  let totalAmount = new Prisma.Decimal(0);
  const updates = [];
  for (const tx of transactions) {
    const taxWithheld = await calculateTaxWithheld(tx.GrossWage, period.PeriodYear);
    const ssoAmount = await calculateSso(tx.GrossWage, period.PeriodYear);
    const welfareFundAmount = await calculateWelfareFund(tx.GrossWage, period.PeriodYear);
    const installmentLines = await getOpenInstallmentDeductions(tx.EmpCode);
    const installmentDeduct = installmentLines.reduce((sum, l) => sum.add(l.amount), new Prisma.Decimal(0));
    const netPay = computeNetPay({
      ...tx,
      TaxWithheld: taxWithheld,
      SSOAmount: ssoAmount,
      WelfareFundAmount: welfareFundAmount,
      InstallmentDeduct: installmentDeduct,
    });
    totalAmount = totalAmount.add(netPay);
    updates.push(
      prisma.trnPayrollTransaction.update({
        where: { TransactionID: tx.TransactionID },
        data: {
          TaxWithheld: taxWithheld,
          SSOAmount: ssoAmount,
          WelfareFundAmount: welfareFundAmount,
          InstallmentDeduct: installmentDeduct,
          NetPay: netPay,
          UpdatedBy: calculatedBy,
          UpdatedDate: new Date(),
        },
      }),
    );
  }

  await prisma.$transaction([
    ...updates,
    prisma.trnPayrollCalculateLog.create({
      data: {
        DocumentNo: documentNo ?? null,
        PeriodID: periodId,
        EmployeeType: period.EmployeeType,
        CalculatedBy: calculatedBy,
        Status: "SUCCESS",
        EmployeeCount: transactions.length,
        TotalAmount: totalAmount,
        CreatedBy: calculatedBy,
      },
    }),
  ]);

  return { employeeCount: transactions.length, totalAmount };
}

// BR-031: "ล้างยอดเงินจ่ายในงวดกลับเป็นศูนย์" — undoes exactly what
// Calculate added (TaxWithheld/SSOAmount/WelfareFundAmount/InstallmentDeduct
// reset to 0 — all four are Calculate-owned, same lifecycle), recomputing
// NetPay from whatever else is on the row, then re-runnable via Calculate
// again.
export async function cancelPayrollCalculate(periodId: number, calculatedBy: string): Promise<CalculateResult> {
  const period = await prisma.sysPeriod.findUnique({ where: { PeriodID: periodId } });
  if (!period) throw new Error("PERIOD_NOT_FOUND");

  const lock = await prisma.trnPayrollLock.findFirst({ where: { PeriodID: periodId, IsLocked: true } });
  if (lock) throw new Error("PERIOD_LOCKED");

  const transactions = await prisma.trnPayrollTransaction.findMany({ where: { PeriodID: periodId } });

  let totalAmount = new Prisma.Decimal(0);
  const updates = transactions.map((tx) => {
    const netPay = computeNetPay({
      ...tx,
      TaxWithheld: new Prisma.Decimal(0),
      SSOAmount: new Prisma.Decimal(0),
      WelfareFundAmount: new Prisma.Decimal(0),
      InstallmentDeduct: new Prisma.Decimal(0),
    });
    totalAmount = totalAmount.add(netPay);
    return prisma.trnPayrollTransaction.update({
      where: { TransactionID: tx.TransactionID },
      data: { TaxWithheld: 0, SSOAmount: 0, WelfareFundAmount: 0, InstallmentDeduct: 0, NetPay: netPay, UpdatedBy: calculatedBy, UpdatedDate: new Date() },
    });
  });

  await prisma.$transaction([
    ...updates,
    prisma.trnPayrollCalculateLog.create({
      data: {
        PeriodID: periodId,
        EmployeeType: period.EmployeeType,
        CalculatedBy: calculatedBy,
        Status: "CANCELLED",
        EmployeeCount: transactions.length,
        TotalAmount: totalAmount,
        CreatedBy: calculatedBy,
      },
    }),
  ]);

  return { employeeCount: transactions.length, totalAmount };
}

// Re-derives OtherIncome/OtherDeduction from trn_payroll_transaction_detail
// (2026-09-21, "รายการประจำงวด") and recomputes NetPay — called after every
// detail-line add/edit/delete. Runs inside the caller's own $transaction so
// the detail-line write and this rollup commit atomically together.
export async function recomputeTransactionOtherTotals(tx: Prisma.TransactionClient, transactionId: number, updatedBy: string) {
  const [transaction, details] = await Promise.all([
    tx.trnPayrollTransaction.findUniqueOrThrow({ where: { TransactionID: transactionId } }),
    tx.trnPayrollTransactionDetail.findMany({ where: { TransactionID: transactionId } }),
  ]);

  let otherIncome = new Prisma.Decimal(0);
  let otherDeduction = new Prisma.Decimal(0);
  for (const d of details) {
    if (d.LineType === "INCOME") otherIncome = otherIncome.add(d.Amount);
    else otherDeduction = otherDeduction.add(d.Amount);
  }

  const netPay = computeNetPay({ ...transaction, OtherIncome: otherIncome, OtherDeduction: otherDeduction });

  await tx.trnPayrollTransaction.update({
    where: { TransactionID: transactionId },
    data: { OtherIncome: otherIncome, OtherDeduction: otherDeduction, NetPay: netPay, UpdatedBy: updatedBy, UpdatedDate: new Date() },
  });
}

export interface RateConfigEntry {
  amount: Prisma.Decimal;
  rateBasis: string;
  incomeName: string;
}

// Shared by GET /api/payroll/transactions/by-employee (seeds a fresh
// transaction's detail lines) and pullPayrollFromWorksheet() below (fills in
// day-counts for an already-existing transaction). Site+position rate
// (mst_site_position_income) wins over the position-generic fallback
// (mst_position_income) — same merge order as the DailyRate fallback used by
// Worksheet (resolveEffectiveDailyRate in src/lib/worksheet.ts).
export async function getRateConfigForEmployee(employee: {
  DefaultSiteCode: string | null;
  PositionCode: string | null;
}): Promise<Map<string, RateConfigEntry>> {
  const [sitePosition, positionIncomes] = await Promise.all([
    employee.DefaultSiteCode && employee.PositionCode
      ? prisma.mstSitePosition.findUnique({
          where: { SiteCode_PositionCode: { SiteCode: employee.DefaultSiteCode, PositionCode: employee.PositionCode } },
          select: { IncomeRows: { select: { IncomeCode: true, Amount: true, RateBasis: true, IncomeType: { select: { IncomeName: true } } } } },
        })
      : null,
    employee.PositionCode
      ? prisma.mstPositionIncome.findMany({
          where: { PositionCode: employee.PositionCode },
          select: { IncomeCode: true, Amount: true, RateBasis: true, IncomeType: { select: { IncomeName: true } } },
        })
      : Promise.resolve([]),
  ]);

  const rateConfig = new Map<string, RateConfigEntry>();
  for (const r of positionIncomes) rateConfig.set(r.IncomeCode, { amount: r.Amount, rateBasis: r.RateBasis, incomeName: r.IncomeType.IncomeName });
  for (const r of sitePosition?.IncomeRows ?? []) rateConfig.set(r.IncomeCode, { amount: r.Amount, rateBasis: r.RateBasis, incomeName: r.IncomeType.IncomeName });
  return rateConfig;
}

export interface PullFromWorksheetResult {
  employeeCount: number;
  linesUpdated: number;
  linesCreated: number;
}

// "ดึงข้อมูลจาก Worksheet" (2026-09-21, รายการประจำงวด; rewritten 2026-09-22
// twice — see below) — for every employee of this EmployeeType (+ optional
// company filter) with APPROVED Worksheet attendance falling inside this
// period's [StartDate, EndDate], tally a day-count per the user's explicit
// rule (2026-09-21): "กรณี รายวัน ให้นับ D = 1, N = 1 และ D-N = 2" — i.e. a
// plain work-day count plus double-shift days counted TWICE — then writes
// that count into the Days (and recomputed Amount = days x rate) of every
// DAILY-rate-basis income line configured for that (site, position) pair
// (mst_site_position_income / mst_position_income), creating the line first
// if it was never seeded. "เอามาเฉพาะรายการที่อนุมัติแล้ว" (user, 2026-09-21)
// is enforced by requiring the owning trn_worksheet_header's Status ===
// "APPROVED" directly. "รีเฟรชคนเก่า" falls out of this for free —
// re-running this always overwrites Days/Amount from the freshly-tallied
// count, whether the detail line already existed or not.
//
// 2026-09-22 rewrite #1: the original version read WorkDays/DoubleShiftDays
// off an EXISTING trn_payroll_transaction row (written once by
// approveWorksheet()'s own upsert) instead of re-deriving attendance itself.
// That made the pull silently unable to recover an employee whose
// "รายการประจำงวด" row had been deleted (DELETE /api/payroll/transactions/
// [id]) — there was nothing left to read WorkDays/DoubleShiftDays off, so
// that employee just vanished from every future pull, bug report from the
// user (screenshot of an empty "รายการประจำงวด" after deleting+re-pulling).
// Fixed by reading trn_worksheet_daily directly (same per-day AttendCode ->
// PayMultiplier tally approveWorksheet() does) and find-or-creating (upsert)
// the trn_payroll_transaction row itself, rather than assuming it already
// exists.
//
// 2026-09-22 rewrite #2: one employee can work more than one site's
// Worksheet in the same period (a SPARE covering a shift elsewhere, per the
// user's screenshots — 6909001 worked 13 days at one site and 1 day at
// another). The version after rewrite #1 still tallied ALL of an employee's
// days into ONE combined count and resolved a SINGLE rate using the
// EMPLOYEE's own DefaultSiteCode/PositionCode (their home site) — not the
// site+position actually worked each day. That was silently wrong money:
// verified against the user's own screenshots, 13 days @ ฿350 + 1 day @
// ฿1,000 = ฿5,550, but the old pull wrote 14 days @ a single (wrong, home-
// site) rate of ฿400 = ฿5,600. Fixed by tallying per (EmpCode, SiteCode)
// instead of per EmpCode alone, resolving each site's rate with that site's
// own SiteCode+PositionCode (mirrors how Worksheet itself already resolves
// DailyRate per-site via resolveEffectiveDailyRate), and writing one
// trn_payroll_transaction_detail row PER SITE per income code (SiteCode is
// now part of that table's unique key) — "รายการประจำงวด" now shows ค่าแรง
// as two separate lines, one per site, each with its own Days/Amount and
// (informational) PositionCode, instead of one merged line. The
// trn_payroll_transaction row itself stays ONE per (EmpCode, PeriodID) as
// before — WorkDays/DoubleShiftDays/HolidayDays on it are still the
// employee's grand total across all sites (that's what "จำนวนวันทำงานรวม"
// in the list means), only the itemized detail lines split by site now.
export async function pullPayrollFromWorksheet(
  periodId: number,
  employeeType: string,
  companyCode: string | null,
  userId: string,
): Promise<PullFromWorksheetResult> {
  const period = await prisma.sysPeriod.findUnique({ where: { PeriodID: periodId } });
  if (!period) throw new Error("PERIOD_NOT_FOUND");

  const lock = await prisma.trnPayrollLock.findFirst({ where: { PeriodID: periodId, IsLocked: true } });
  if (lock) throw new Error("PERIOD_LOCKED");

  const zero = new Prisma.Decimal(0);
  const attendanceCodes = await prisma.mstAttendanceCode.findMany();
  const multiplierByCode = new Map(attendanceCodes.map((c) => [c.Code, c.PayMultiplier]));

  const dailyRows = await prisma.trnWorksheetDaily.findMany({
    where: {
      WorkDate: { gte: period.StartDate, lte: period.EndDate },
      AttendCode: { not: null },
      Detail: {
        Header: { Status: "APPROVED" },
        Employee: { EmployeeType: employeeType, ...(companyCode ? { CompanyCode: companyCode } : {}) },
      },
    },
    select: {
      AttendCode: true,
      Detail: {
        select: {
          EmpCode: true,
          PositionCode: true,
          Header: { select: { WorksheetID: true, SiteCode: true } },
          Employee: { select: { PositionCode: true } },
        },
      },
    },
  });

  interface SiteGroup {
    empCode: string;
    siteCode: string;
    positionCode: string | null;
    worksheetId: number;
    workDays: Prisma.Decimal;
    doubleShiftDays: Prisma.Decimal;
    holidayDays: Prisma.Decimal;
  }

  // Keyed by `${empCode}::${siteCode}` — one entry per site an employee
  // actually worked this period, each resolving its own rate independently.
  const bySiteGroup = new Map<string, SiteGroup>();

  for (const row of dailyRows) {
    const multiplier = row.AttendCode ? multiplierByCode.get(row.AttendCode) : undefined;
    if (multiplier === undefined) continue;
    const empCode = row.Detail.EmpCode;
    const siteCode = row.Detail.Header.SiteCode;
    const key = `${empCode}::${siteCode}`;
    const group = bySiteGroup.get(key) ?? {
      empCode,
      // trn_worksheet_detail.PositionCode is null on rows created before
      // the 2026-09-21 migration that added it — falling back to the
      // employee's own PositionCode (mst_employee) for those old rows is
      // exactly what REGULAR rows already snapshot going forward, so this
      // just backfills the same value for ones that predate the column.
      // Without this fallback, getRateConfigForEmployee() below returns an
      // empty map for a null PositionCode and the whole site is silently
      // skipped — a real employee's REGULAR site never getting a detail
      // line at all (caught 2026-09-22 on 6909001's real data: their site
      // 201 REGULAR row predates the migration, so it was being skipped
      // entirely while their site 202 SPARE row — added after the
      // migration, so it already had PositionCode set — worked correctly).
      siteCode,
      positionCode: row.Detail.PositionCode ?? row.Detail.Employee.PositionCode,
      worksheetId: row.Detail.Header.WorksheetID,
      workDays: zero,
      doubleShiftDays: zero,
      holidayDays: zero,
    };
    if (multiplier.equals(0)) group.holidayDays = group.holidayDays.add(1);
    else if (multiplier.equals(2)) group.doubleShiftDays = group.doubleShiftDays.add(1);
    else group.workDays = group.workDays.add(1);
    bySiteGroup.set(key, group);
  }

  // Per-employee grand totals across all sites — for the single
  // trn_payroll_transaction row's WorkDays/DoubleShiftDays/HolidayDays
  // (the "จำนวนวันทำงานรวม" list column) and its legacy single-value
  // SiteCode/SourceWorksheetID (last site touched "wins" there, same as
  // approveWorksheet()'s own upsert — not a new limitation).
  const employeeGroups = new Map<string, SiteGroup[]>();
  for (const group of bySiteGroup.values()) {
    const list = employeeGroups.get(group.empCode) ?? [];
    list.push(group);
    employeeGroups.set(group.empCode, list);
  }

  let linesUpdated = 0;
  let linesCreated = 0;
  let employeeCount = 0;

  for (const [empCode, groups] of employeeGroups) {
    const totalWorkDays = groups.reduce((sum, g) => sum.add(g.workDays), zero);
    const totalDoubleShiftDays = groups.reduce((sum, g) => sum.add(g.doubleShiftDays), zero);
    const totalHolidayDays = groups.reduce((sum, g) => sum.add(g.holidayDays), zero);
    const last = groups[groups.length - 1];

    // Resolve each site's rate config up front — skip entirely (no
    // transaction touched at all) if not one single site has any
    // DAILY-rate income configured for it, same "nothing to pull" no-op as
    // before.
    const perSiteDailyLines = await Promise.all(
      groups.map(async (g) => {
        const rateConfig = await getRateConfigForEmployee({ DefaultSiteCode: g.siteCode, PositionCode: g.positionCode });
        const dailyLines = [...rateConfig.entries()].filter(([, cfg]) => cfg.rateBasis === "DAILY");
        return { group: g, dailyLines };
      }),
    );
    if (perSiteDailyLines.every((s) => s.dailyLines.length === 0)) continue;
    employeeCount++;

    await prisma.$transaction(async (tx) => {
      // Find-or-create the trn_payroll_transaction row itself — it may have
      // been deleted from "รายการประจำงวด" since the Worksheet was approved,
      // or never existed at all (e.g. this employee was added to the
      // Worksheet after the period's rows were first seeded some other way).
      // GrossWage is deliberately 0 here, not a computed total: the ค่าแรง
      // DAILY-rate detail line(s) below take over representing this
      // employee's wage, and computeNetPay() always adds GrossWage +
      // OtherIncome unconditionally — leaving GrossWage non-zero would
      // double-pay the wage.
      const transaction = await tx.trnPayrollTransaction.upsert({
        where: { EmpCode_PeriodID: { EmpCode: empCode, PeriodID: periodId } },
        update: {
          SiteCode: last.siteCode,
          WorkDays: totalWorkDays,
          DoubleShiftDays: totalDoubleShiftDays,
          HolidayDays: totalHolidayDays,
          GrossWage: 0,
          SourceWorksheetID: last.worksheetId,
          UpdatedBy: userId,
          UpdatedDate: new Date(),
        },
        create: {
          EmpCode: empCode,
          PeriodID: periodId,
          SiteCode: last.siteCode,
          WorkDays: totalWorkDays,
          DoubleShiftDays: totalDoubleShiftDays,
          HolidayDays: totalHolidayDays,
          GrossWage: 0,
          NetPay: 0,
          SourceWorksheetID: last.worksheetId,
          CreatedBy: userId,
        },
      });

      for (const { group, dailyLines } of perSiteDailyLines) {
        const days = group.workDays.add(group.doubleShiftDays.mul(2));
        for (const [code, cfg] of dailyLines) {
          const amount = days.mul(cfg.amount);
          const existing = await tx.trnPayrollTransactionDetail.findUnique({
            where: { TransactionID_LineType_Code_SiteCode: { TransactionID: transaction.TransactionID, LineType: "INCOME", Code: code, SiteCode: group.siteCode } },
          });
          if (existing) {
            await tx.trnPayrollTransactionDetail.update({
              where: { DetailID: existing.DetailID },
              data: { Days: days, Amount: amount, PositionCode: group.positionCode, UpdatedBy: userId, UpdatedDate: new Date() },
            });
            linesUpdated++;
          } else {
            await tx.trnPayrollTransactionDetail.create({
              data: {
                TransactionID: transaction.TransactionID,
                LineType: "INCOME",
                Code: code,
                Description: cfg.incomeName,
                SiteCode: group.siteCode,
                PositionCode: group.positionCode,
                Days: days,
                Amount: amount,
                CreatedBy: userId,
              },
            });
            linesCreated++;
          }
        }
      }

      await recomputeTransactionOtherTotals(tx, transaction.TransactionID, userId);
    });
  }

  return { employeeCount, linesUpdated, linesCreated };
}
