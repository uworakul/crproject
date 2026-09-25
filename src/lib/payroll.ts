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
  // ปัดเป็นจำนวนเต็มบาท แบบ round-half-up (2026-09-22, ผู้ใช้ยืนยัน "เกิน 0.5
  // ปัดขึ้น" — เศษ .50 ขึ้นไปปัดขึ้น ต่ำกว่าปัดลง, ตรงกับธรรมเนียมการปัดเศษ
  // ประกันสังคมทั่วไป) — ต่างจาก TaxWithheld/WelfareFundAmount ที่ผู้ใช้ไม่ได้
  // ขอเปลี่ยน ยังคงทศนิยม 2 ตำแหน่งตามเดิม
  return base.mul(rate.EmployeeRate).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
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
  amount: Prisma.Decimal; // requested this period = min(DeductPerPeriod, RemainingAmount) — or the FULL RemainingAmount when fullSettlement is set (see below) — BEFORE priority rationing, see getRationedDeductionBreakdown() for what actually gets withheld
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
//
// `fullSettlement` (2026-09-25): "รายวัน/รายเดือน กรณีลาออก ให้นำยอดค้าง
// ทั้งหมด มาหัก" — for an employee's actual final period (see
// isFinalSettlementPeriod below), request the FULL RemainingAmount per debt
// instead of the normal per-period min(DeductPerPeriod, RemainingAmount).
// Still subject to the same 6-category priority order and "NetPay must never
// go negative" floor downstream in allocateByPriority/recomputeTransactionOtherTotals
// — only what's REQUESTED here changes, confirmed with the user.
export async function getOpenInstallmentDeductions(empCode: string, options: { fullSettlement?: boolean } = {}): Promise<InstallmentDeductionLine[]> {
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
      amount: options.fullSettlement ? d.RemainingAmount : Prisma.Decimal.min(d.DeductPerPeriod!, d.RemainingAmount),
      remainingAmount: d.RemainingAmount,
    }));
}

// "รายวัน/รายเดือน กรณีลาออก ให้นำยอดค้างทั้งหมด มาหัก" (2026-09-25) — true only
// for the period that actually CONTAINS the employee's ResignDate, never any
// period calculated/re-opened after it (that would re-trigger full
// settlement every time, not just once at the end).
function isFinalSettlementPeriod(employeeStatus: string, resignDate: Date | null, periodStart: Date, periodEnd: Date): boolean {
  if (employeeStatus !== "RESIGNED" || !resignDate) return false;
  return resignDate.getTime() >= periodStart.getTime() && resignDate.getTime() <= periodEnd.getTime();
}

// --- Deduction priority / rationing (2026-09-22) ------------------------
//
// User: "ยอดหักสุทธิ ต้องไม่ติดลบ" (NetPay must never go negative), with an
// explicit priority order for which deductions get paid first when there
// isn't enough income to cover everything:
//   1. เบิกล่วงหน้า   2. เครื่องแบบ   3. เงินประกัน
//   4. ค่าบัตร        5. เงินกู้      6. เงินหักอื่นๆ
// Confirmed with the user (2026-09-22, two follow-up questions):
//   - ภาษีหัก ณ ที่จ่าย / ประกันสังคม / กองทุนสงเคราะห์พนักงาน are NOT part of
//     this queue at all — those are statutory, always deducted in full
//     FIRST, before the 6-category queue even starts.
//   - ref_deduction_type code "08" ("ค่าชุด/ค่าบัตร") bundles what would be
//     categories 2 and 4 into one code with no way to split it as the data
//     stands today — user's call: treat all of code "08" as category 2
//     (เครื่องแบบ). Category 4 (ค่าบัตร) therefore has no code mapped to it
//     yet; the bucket exists in the priority order for if/when one is added.
//   - "ถ้ายอดเงินไม่เหลือพอให้หัก ก็จะหักเท่าที่หักได้ และไม่ไปหักถัดไป" —
//     sequential greedy allocation: pay each item in full while the pool
//     lasts, the one item that exhausts the pool gets a partial amount, and
//     every item after it gets zero. This falls out naturally from
//     `remaining -= take` in allocateByPriority() below — no extra "stop"
//     flag needed, since remaining is exactly 0 after a partial take.
const DEDUCTION_CODE_PRIORITY: Record<string, number> = {
  // 1. เบิกล่วงหน้า
  ADVANCE: 1,
  ADVANCEN: 1,
  ADVANCEU: 1,
  "13": 1, // เงินเบิกล่วงหน้า
  "14": 1, // เงินเบิกพนักงานใหม่
  "15": 1, // เงินเบิกฉุกเฉิน
  // 2. เครื่องแบบ (รวม "08 ค่าชุด/ค่าบัตร" ทั้งหมดไว้ที่นี่ตามที่ผู้ใช้ยืนยัน)
  UNIFORM: 2,
  "08": 2,
  // 3. เงินประกัน
  "09": 3,
  // 4. ค่าบัตร — ยังไม่มีรหัสแยกในระบบตอนนี้
  // 5. เงินกู้
  LOAN: 5,
  "12": 5,
};
// ทุกรหัสที่ไม่ได้ระบุไว้ข้างบน (เช่น สาย/ขาดงาน/ค่าเสียหาย/ค่าปรับ/ค่าอบรม/
// เงินสะสม/กยศ/กรมบังคับคดี/อื่นๆ) ตกไปอยู่ bucket 6 "เงินหักอื่นๆ" โดย default
function deductionPriorityBucket(code: string): number {
  return DEDUCTION_CODE_PRIORITY[code] ?? 6;
}

interface RationingItem {
  key: string;
  bucket: number;
  amount: Prisma.Decimal;
}

// Sequential greedy allocation in priority order (ascending bucket number =
// higher priority). Returns how much of `pool` each item actually gets.
function allocateByPriority(pool: Prisma.Decimal, items: RationingItem[]): Map<string, Prisma.Decimal> {
  const sorted = [...items].sort((a, b) => a.bucket - b.bucket);
  let remaining = Prisma.Decimal.max(pool, 0);
  const result = new Map<string, Prisma.Decimal>();
  for (const item of sorted) {
    const take = Prisma.Decimal.max(Prisma.Decimal.min(item.amount, remaining), 0);
    result.set(item.key, take);
    remaining = remaining.sub(take);
  }
  return result;
}

type DeductionSource = "install" | "detail" | "legacy";

export interface DeductionBreakdownItem {
  key: string;
  source: DeductionSource;
  code: string;
  label: string;
  bucket: number;
  requested: Prisma.Decimal; // the full amount owed/configured for this item
  allocated: Prisma.Decimal; // what actually gets withheld this period after rationing
  remainingAmount: Prisma.Decimal | null; // for "install" items only — debt balance BEFORE this period
}

// Gathers every deduction ITEM (not aggregate) that participates in the
// priority queue: this employee's open installment debts, this
// transaction's manually-added DEDUCTION detail lines, and the 4 legacy
// Worksheet-era scalar fields (AdvanceDeduct/UniformDeduct/LoanDeduct/
// TrainingDeduct — each rationed as one atomic item since they have no
// further sub-breakdown). Statutory fields (Tax/SSO/WelfareFund) are
// deliberately excluded — those are handled separately, always in full.
async function collectDeductionItems(
  client: Pick<Prisma.TransactionClient, "trnPayrollTransactionDetail">,
  transaction: { TransactionID: number; EmpCode: string; AdvanceDeduct: Prisma.Decimal; UniformDeduct: Prisma.Decimal; LoanDeduct: Prisma.Decimal; TrainingDeduct: Prisma.Decimal },
  fullSettlement: boolean = false,
): Promise<{ items: DeductionBreakdownItem[]; installmentLines: InstallmentDeductionLine[] }> {
  const [deductionDetails, installmentLines] = await Promise.all([
    client.trnPayrollTransactionDetail.findMany({ where: { TransactionID: transaction.TransactionID, LineType: "DEDUCTION" } }),
    getOpenInstallmentDeductions(transaction.EmpCode, { fullSettlement }),
  ]);

  const items: DeductionBreakdownItem[] = [];
  for (const l of installmentLines) {
    items.push({ key: `debt:${l.debtId}`, source: "install", code: l.code, label: l.label, bucket: deductionPriorityBucket(l.code), requested: l.amount, allocated: new Prisma.Decimal(0), remainingAmount: l.remainingAmount });
  }
  for (const d of deductionDetails) {
    items.push({ key: `detail:${d.DetailID}`, source: "detail", code: d.Code, label: d.Description, bucket: deductionPriorityBucket(d.Code), requested: d.Amount, allocated: new Prisma.Decimal(0), remainingAmount: null });
  }
  const legacy: [string, string, string, number, Prisma.Decimal][] = [
    ["legacy:advance", "ADVANCE", "หักเบิกล่วงหน้า", 1, transaction.AdvanceDeduct],
    ["legacy:uniform", "UNIFORM", "หักเครื่องแบบ", 2, transaction.UniformDeduct],
    ["legacy:loan", "LOAN", "หักเงินกู้", 5, transaction.LoanDeduct],
    ["legacy:training", "TRAINING", "หักค่าอบรม", 6, transaction.TrainingDeduct],
  ];
  for (const [key, code, label, bucket, amount] of legacy) {
    if (amount.gt(0)) items.push({ key, source: "legacy", code, label, bucket, requested: amount, allocated: new Prisma.Decimal(0), remainingAmount: null });
  }

  return { items, installmentLines };
}

// Read-only preview of exactly what will be withheld this period per
// deduction item, after priority rationing — used by GET
// /api/payroll/installment-deductions so the breakdown shown on-screen
// always matches what recomputeTransactionOtherTotals() below actually
// saves (same computation, same priority rules, just not written anywhere).
export async function getRationedDeductionBreakdown(transactionId: number): Promise<{ items: DeductionBreakdownItem[]; pool: Prisma.Decimal }> {
  const transaction = await prisma.trnPayrollTransaction.findUniqueOrThrow({
    where: { TransactionID: transactionId },
    include: { Employee: { select: { EmployeeStatus: true, ResignDate: true } }, Period: { select: { StartDate: true, EndDate: true } } },
  });
  const incomeDetails = await prisma.trnPayrollTransactionDetail.findMany({ where: { TransactionID: transactionId, LineType: "INCOME" } });
  const otherIncome = incomeDetails.reduce((s, d) => s.add(d.Amount), new Prisma.Decimal(0));

  const fullSettlement = isFinalSettlementPeriod(transaction.Employee.EmployeeStatus, transaction.Employee.ResignDate, transaction.Period.StartDate, transaction.Period.EndDate);
  const { items } = await collectDeductionItems(prisma, transaction, fullSettlement);
  const income = transaction.GrossWage.add(otherIncome);
  const statutory = transaction.TaxWithheld.add(transaction.SSOAmount).add(transaction.WelfareFundAmount);
  const pool = Prisma.Decimal.max(income.sub(statutory), 0);
  const allocated = allocateByPriority(
    pool,
    items.map((i) => ({ key: i.key, bucket: i.bucket, amount: i.requested })),
  );

  return { items: items.map((i) => ({ ...i, allocated: allocated.get(i.key) ?? new Prisma.Decimal(0) })), pool };
}

// "ยอดจากการคำนวน" (2026-09-24) — per-debt live preview of what THIS
// employee's CURRENT period would actually withhold against each open
// installment debt, shown on the ทะเบียนพนักงาน "รายการหักต่องวด" tab right
// before "ยอดคงเหลือ" so HR can see what's about to happen before it does.
// Zero (or absent) whenever there's nothing to preview yet — no current
// period for this EmployeeType, or no trn_payroll_transaction has been
// opened/calculated for them in it — same "not an error, just nothing to
// show" convention as getOpenInstallmentDeductions(). Returns a debtId→
// allocated map; callers merge it onto whatever debt rows they already have.
export async function getCurrentPeriodInstallmentAllocations(empCode: string): Promise<Map<number, Prisma.Decimal>> {
  const employee = await prisma.mstEmployee.findUnique({ where: { EmpCode: empCode }, select: { EmployeeType: true } });
  if (!employee) return new Map();

  const period = await prisma.sysPeriod.findFirst({ where: { EmployeeType: employee.EmployeeType, IsCurrent: true } });
  if (!period) return new Map();

  const transaction = await prisma.trnPayrollTransaction.findUnique({ where: { EmpCode_PeriodID: { EmpCode: empCode, PeriodID: period.PeriodID } } });
  if (!transaction) return new Map();

  const { items } = await getRationedDeductionBreakdown(transaction.TransactionID);
  const result = new Map<number, Prisma.Decimal>();
  for (const item of items) {
    if (item.source !== "install") continue;
    const debtId = Number(item.key.slice("debt:".length));
    result.set(debtId, item.allocated);
  }
  return result;
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

  // 2026-09-25: MONTHLY employees have no Worksheet to populate
  // trn_payroll_transaction from at all — this is done automatically here,
  // as part of Calculate itself (see pullPayrollForMonthlyEmployees for why),
  // BEFORE the transactions query below so newly-created/updated rows are
  // picked up by this same Calculate run.
  if (period.EmployeeType === "MONTHLY") {
    await pullPayrollForMonthlyEmployees(periodId, calculatedBy, filters);
  }

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

  // 2026-09-22: restructured from a flat array of independent .update()
  // calls into a single callback $transaction — recomputeTransactionOtherTotals()
  // (the priority-rationing engine, see above) needs to READ each
  // transaction's just-written Tax/SSO/WelfareFund back before it can
  // compute the pool available for the 6-category deduction queue, which a
  // flat pre-built array of update promises can't do (each promise is
  // independent, none of them can see another's result before it runs).
  let totalAmount = new Prisma.Decimal(0);
  await prisma.$transaction(async (t) => {
    for (const row of transactions) {
      const taxWithheld = await calculateTaxWithheld(row.GrossWage, period.PeriodYear);
      const ssoAmount = await calculateSso(row.GrossWage, period.PeriodYear);
      const welfareFundAmount = await calculateWelfareFund(row.GrossWage, period.PeriodYear);
      await t.trnPayrollTransaction.update({
        where: { TransactionID: row.TransactionID },
        data: { TaxWithheld: taxWithheld, SSOAmount: ssoAmount, WelfareFundAmount: welfareFundAmount, UpdatedBy: calculatedBy, UpdatedDate: new Date() },
      });
      const netPay = await recomputeTransactionOtherTotals(t, row.TransactionID, calculatedBy);
      totalAmount = totalAmount.add(netPay);
    }

    await t.trnPayrollCalculateLog.create({
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
    });
  });

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

  // 2026-09-22: same restructuring as runPayrollCalculate — zero Tax/SSO/
  // WelfareFund first, then let recomputeTransactionOtherTotals() re-ration
  // whatever's left (OtherDeduction/legacy fields) against the now-larger
  // pool, forcing InstallmentDeduct to 0 via includeInstallments:false (see
  // that function's comment for why).
  let totalAmount = new Prisma.Decimal(0);
  await prisma.$transaction(async (t) => {
    for (const row of transactions) {
      await t.trnPayrollTransaction.update({
        where: { TransactionID: row.TransactionID },
        data: { TaxWithheld: 0, SSOAmount: 0, WelfareFundAmount: 0, UpdatedBy: calculatedBy, UpdatedDate: new Date() },
      });
      const netPay = await recomputeTransactionOtherTotals(t, row.TransactionID, calculatedBy, { includeInstallments: false });
      totalAmount = totalAmount.add(netPay);
    }

    await t.trnPayrollCalculateLog.create({
      data: {
        PeriodID: periodId,
        EmployeeType: period.EmployeeType,
        CalculatedBy: calculatedBy,
        Status: "CANCELLED",
        EmployeeCount: transactions.length,
        TotalAmount: totalAmount,
        CreatedBy: calculatedBy,
      },
    });
  });

  return { employeeCount: transactions.length, totalAmount };
}

// Re-derives OtherIncome from trn_payroll_transaction_detail, applies
// priority rationing (2026-09-22, see collectDeductionItems/allocateByPriority
// above) across every deduction item — installment debts, DEDUCTION detail
// lines, and the 4 legacy scalar fields — and recomputes NetPay, floored at
// 0. Called after every detail-line add/edit/delete AND from
// runPayrollCalculate/cancelPayrollCalculate/the manual Transaction-screen
// PUT (all of which may change GrossWage/OtherIncome/Tax/SSO/Welfare, any of
// which shifts how much of the pool is left for the priority queue). Runs
// inside the caller's own $transaction so everything commits atomically.
//
// 2026-09-22: kept the exported name (was previously a much smaller
// "OtherIncome/OtherDeduction only" rollup) so none of its existing call
// sites (worksheet.ts, transaction-details routes) needed to change —
// what changed is what happens inside it, not who calls it or when.
//
// `includeInstallments` (default true) exists only for cancelPayrollCalculate()
// (BR-031, "ล้าง...กลับเป็นศูนย์"): Cancel must force InstallmentDeduct back
// to exactly 0 — NOT let it get freshly re-derived and re-rationed against
// the (now larger, since Tax/SSO/Welfare just got zeroed too) pool, which is
// what would happen if installment debts stayed in the priority queue here.
// OtherDeduction/legacy fields still get rationed normally against whatever
// pool remains — only the installment-debt items are excluded entirely.
export async function recomputeTransactionOtherTotals(tx: Prisma.TransactionClient, transactionId: number, updatedBy: string, options: { includeInstallments?: boolean } = {}) {
  const includeInstallments = options.includeInstallments ?? true;
  const transaction = await tx.trnPayrollTransaction.findUniqueOrThrow({
    where: { TransactionID: transactionId },
    include: { Employee: { select: { EmployeeStatus: true, ResignDate: true } }, Period: { select: { StartDate: true, EndDate: true } } },
  });
  const incomeDetails = await tx.trnPayrollTransactionDetail.findMany({ where: { TransactionID: transactionId, LineType: "INCOME" } });
  const otherIncome = incomeDetails.reduce((s, d) => s.add(d.Amount), new Prisma.Decimal(0));

  const fullSettlement = isFinalSettlementPeriod(transaction.Employee.EmployeeStatus, transaction.Employee.ResignDate, transaction.Period.StartDate, transaction.Period.EndDate);
  const { items: allItems } = await collectDeductionItems(tx, transaction, fullSettlement);
  const items = includeInstallments ? allItems : allItems.filter((i) => i.source !== "install");
  const income = transaction.GrossWage.add(otherIncome);
  const statutory = transaction.TaxWithheld.add(transaction.SSOAmount).add(transaction.WelfareFundAmount);
  const pool = Prisma.Decimal.max(income.sub(statutory), 0);
  const allocated = allocateByPriority(
    pool,
    items.map((i) => ({ key: i.key, bucket: i.bucket, amount: i.requested })),
  );

  let otherDeduction = new Prisma.Decimal(0);
  let installmentDeduct = new Prisma.Decimal(0);
  let advanceDeduct = new Prisma.Decimal(0);
  let uniformDeduct = new Prisma.Decimal(0);
  let loanDeduct = new Prisma.Decimal(0);
  let trainingDeduct = new Prisma.Decimal(0);
  for (const item of items) {
    const amt = allocated.get(item.key) ?? new Prisma.Decimal(0);
    if (item.source === "detail") otherDeduction = otherDeduction.add(amt);
    else if (item.source === "install") installmentDeduct = installmentDeduct.add(amt);
    else if (item.key === "legacy:advance") advanceDeduct = amt;
    else if (item.key === "legacy:uniform") uniformDeduct = amt;
    else if (item.key === "legacy:loan") loanDeduct = amt;
    else if (item.key === "legacy:training") trainingDeduct = amt;
  }

  // max(0, ...) here is belt-and-suspenders, not the primary mechanism —
  // allocateByPriority() already guarantees the deduction items alone never
  // exceed `pool`, so this only matters if statutory withholding ALONE
  // (never rationed, per the user) somehow exceeds income, an edge case
  // this floor still protects against per "ยอดหักสุทธิ ต้องไม่ติดลบ".
  const netPay = Prisma.Decimal.max(income.sub(statutory).sub(otherDeduction).sub(installmentDeduct).sub(advanceDeduct).sub(uniformDeduct).sub(loanDeduct).sub(trainingDeduct), 0);

  await tx.trnPayrollTransaction.update({
    where: { TransactionID: transactionId },
    data: {
      OtherIncome: otherIncome,
      OtherDeduction: otherDeduction,
      InstallmentDeduct: installmentDeduct,
      AdvanceDeduct: advanceDeduct,
      UniformDeduct: uniformDeduct,
      LoanDeduct: loanDeduct,
      TrainingDeduct: trainingDeduct,
      NetPay: netPay,
      UpdatedBy: updatedBy,
      UpdatedDate: new Date(),
    },
  });

  return netPay;
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
      // employee's wage, and NetPay always adds GrossWage + OtherIncome
      // unconditionally — leaving GrossWage non-zero would double-pay the
      // wage.
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

export interface PullMonthlyResult {
  employeeCount: number;
  linesCreated: number;
  linesUpdated: number;
}

const MONTHLY_SALARY_INCOME_CODE = "02"; // ref_income_type: "เงินเดือน"

function daysBetweenInclusive(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

// "รายเดือน กรณีเข้าใหม่ และ ลาออก ให้คำนวณวันทำงาน เพื่อเป็นเงินเดือนในเดือน
// แรก/เดือนสุดท้าย" (2026-09-25) — unlike DAILY employees (who have a
// Worksheet attendance grid to pull from), MONTHLY employees have NO per-day
// record at all: this function IS their entire "รายการประจำงวด" population
// mechanism, run automatically as the first step of runPayrollCalculate()
// whenever the period's EmployeeType is MONTHLY. Confirmed with the user:
// "รายเดือน จะไม่มี Worksheet และ บางเดือนอาจจะไม่มีรายการประจำงวด การคำนวณ
// ใช้เมนู คำนวณรายได้/รายการหัก เลย" — there's no separate "ดึงข้อมูลจาก
// Worksheet"-style button/step for MONTHLY, it's just part of clicking
// Calculate.
//
// Day-count formulas confirmed with the user via concrete examples
// (2026-09-25, resigned/started on the 10th of a 30-day month — the
// original 15th-of-30 example didn't disambiguate, both candidate formulas
// gave 14 either way):
//   - continuing through the whole period: full MonthlySalary, no proration
//   - new hire mid-period (started day 10): workDays = periodEnd − startDate + 1 (= 21)
//   - resigns mid-period (resigned day 10):  workDays = (resignDate − 1 day) − periodStart + 1 (= 9)
//   - both in the same period (hired and resigned within it): the overlap of the two above
// Amount = isFullPeriod ? MonthlySalary : (workDays / totalDaysInPeriod) × MonthlySalary
// — same (days/dayCount)×rate shape the manual "จำนวนวัน"→"จำนวนเงิน"
// auto-calc on this screen already uses for MONTHLY-basis อัตรากำลังพล rows
// (computeAmountFromDays in transaction-detail-panel.tsx), just derived
// automatically here instead of typed in by hand.
//
// Writes ONLY the "02 เงินเดือน" detail line (LineType=INCOME, SiteCode=null
// — MONTHLY employees don't have Worksheet's multi-site-per-period
// complication) — never touches any other line (OT/ค่าตำแหน่ง/ฯลฯ) HR may
// have added by hand for this employee, same "only own what you write"
// discipline as pullPayrollFromWorksheet's ค่าแรง lines. GrossWage stays 0
// for the same reason: the detail line owns the wage, and NetPay = GrossWage
// + OtherIncome unconditionally, so a non-zero GrossWage here would
// double-pay. Employees with no MonthlySalary set, or no DefaultSiteCode, or
// EmployeeStatus=TERMINATED, are silently skipped — same "nothing to pull
// yet" convention as DAILY employees with no DailyRate.
export async function pullPayrollForMonthlyEmployees(periodId: number, userId: string, filters: CalculateFilters = {}): Promise<PullMonthlyResult> {
  const period = await prisma.sysPeriod.findUnique({ where: { PeriodID: periodId } });
  if (!period) throw new Error("PERIOD_NOT_FOUND");

  const lock = await prisma.trnPayrollLock.findFirst({ where: { PeriodID: periodId, IsLocked: true } });
  if (lock) throw new Error("PERIOD_LOCKED");

  const { empCodeFrom, empCodeTo, companyCode, deptCode, empCode } = filters;
  const employees = await prisma.mstEmployee.findMany({
    where: {
      EmployeeType: period.EmployeeType,
      MonthlySalary: { not: null },
      DefaultSiteCode: { not: null },
      StartDate: { lte: period.EndDate },
      // Same eligibility rule as Worksheet's own employee query
      // (src/lib/worksheet.ts): TERMINATED never eligible (no "still active
      // through" date field for it, unlike ResignDate); RESIGNED only for
      // the period actually containing their ResignDate.
      OR: [{ EmployeeStatus: { notIn: ["RESIGNED", "TERMINATED"] } }, { EmployeeStatus: "RESIGNED", ResignDate: { gte: period.StartDate, lte: period.EndDate } }],
      ...(empCodeFrom ? { EmpCode: { gte: empCodeFrom } } : {}),
      ...(empCodeTo ? { EmpCode: { lte: empCodeTo } } : {}),
      ...(empCode ? { EmpCode: empCode } : {}),
      ...(companyCode ? { CompanyCode: companyCode } : {}),
      ...(deptCode ? { DeptCode: deptCode } : {}),
    },
  });

  const totalDaysInPeriod = daysBetweenInclusive(period.StartDate, period.EndDate);
  let employeeCount = 0;
  let linesCreated = 0;
  let linesUpdated = 0;

  for (const employee of employees) {
    const workStart = employee.StartDate.getTime() > period.StartDate.getTime() ? employee.StartDate : period.StartDate;
    const isResigningThisPeriod = employee.EmployeeStatus === "RESIGNED" && employee.ResignDate !== null;
    const workEnd = isResigningThisPeriod ? new Date(employee.ResignDate!.getTime() - 86400000) : period.EndDate;

    const workDays = workEnd.getTime() < workStart.getTime() ? 0 : daysBetweenInclusive(workStart, workEnd);
    const isFullPeriod = workStart.getTime() === period.StartDate.getTime() && workEnd.getTime() === period.EndDate.getTime();
    const amount =
      workDays <= 0
        ? new Prisma.Decimal(0)
        : isFullPeriod
          ? employee.MonthlySalary!
          : new Prisma.Decimal(workDays).div(totalDaysInPeriod).mul(employee.MonthlySalary!).toDecimalPlaces(2);

    employeeCount++;
    await prisma.$transaction(async (tx) => {
      const transaction = await tx.trnPayrollTransaction.upsert({
        where: { EmpCode_PeriodID: { EmpCode: employee.EmpCode, PeriodID: periodId } },
        update: { UpdatedBy: userId, UpdatedDate: new Date() },
        create: { EmpCode: employee.EmpCode, PeriodID: periodId, SiteCode: employee.DefaultSiteCode!, GrossWage: 0, NetPay: 0, CreatedBy: userId },
      });

      // findFirst, not the TransactionID_LineType_Code_SiteCode compound-unique
      // lookup used elsewhere in this file — Prisma's generated compound-unique
      // input for that key requires a non-null SiteCode (SQL Server doesn't
      // treat multiple NULLs there as colliding, so Prisma can't use it as a
      // unique lookup key when SiteCode is null, which it always is here:
      // MONTHLY employees don't have Worksheet's multi-site-per-period case).
      const existing = await tx.trnPayrollTransactionDetail.findFirst({
        where: { TransactionID: transaction.TransactionID, LineType: "INCOME", Code: MONTHLY_SALARY_INCOME_CODE, SiteCode: null },
      });
      if (existing) {
        await tx.trnPayrollTransactionDetail.update({
          where: { DetailID: existing.DetailID },
          data: { Days: workDays, Amount: amount, UpdatedBy: userId, UpdatedDate: new Date() },
        });
        linesUpdated++;
      } else {
        await tx.trnPayrollTransactionDetail.create({
          data: { TransactionID: transaction.TransactionID, LineType: "INCOME", Code: MONTHLY_SALARY_INCOME_CODE, Description: "เงินเดือน", Days: workDays, Amount: amount, CreatedBy: userId },
        });
        linesCreated++;
      }

      await recomputeTransactionOtherTotals(tx, transaction.TransactionID, userId);
    });
  }

  return { employeeCount, linesCreated, linesUpdated };
}

// --- Period closing (2026-09-24) ----------------------------------------
//
// User: "การปิดสิ้นงวด คือการปรับปรุงยอดหนี้คงค้าง ทุกเรื่องที่มีการหักเงินไว้
// และ เอางวดปัจจุบันไปงวดถัดไป (ถ้ามีกำหนดไว้) แต่ถ้าไม่มีก็สร้างงวดให้เลย
// ต่อจากงวดเดิม ของประเภทพนักงานที่ปิดงวดไป" — closing is the moment the
// live "ยอดจากการคำนวน" preview (getCurrentPeriodInstallmentAllocations,
// used on the ทะเบียนพนักงาน "รายการหักต่องวด" tab) becomes real:
// inv_employee_debt.RemainingAmount/PaidAmount are permanently adjusted by
// exactly what getRationedDeductionBreakdown() already showed as "allocated"
// for this period (same number as the Payslip's deduction line — "ยอดหัก
// ตาม payslip" per the user), and IsCurrent moves to whatever period covers
// the day right after this one ends for the same EmployeeType — reusing an
// already-configured period if one exists, auto-creating one with the same
// cadence if not.
export interface PeriodClosingResult {
  debtsSettled: number;
  nextPeriodId: number;
  nextPeriodCreated: boolean;
}

function lastDayOfUtcMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

// Mirrors the closing period's own cadence: a full calendar month rolls to
// the next full month; a 1st-15th half rolls to 16th-EOM of the SAME month;
// a 16th-EOM half rolls to 1st-15th of the NEXT month. Anything else (a
// custom split nobody's described a rule for) falls back to "the day right
// after EndDate, through the end of that month" — a reasonable default, not
// a guess at an undocumented business rule.
function computeNextPeriodRange(start: Date, end: Date): { start: Date; end: Date } {
  const sD = start.getUTCDate();
  const eY = end.getUTCFullYear();
  const eM = end.getUTCMonth();
  const eD = end.getUTCDate();
  const eLastDay = lastDayOfUtcMonth(eY, eM);

  if (sD === 1 && eD === eLastDay) {
    const nY = eM === 11 ? eY + 1 : eY;
    const nM = (eM + 1) % 12;
    return { start: new Date(Date.UTC(nY, nM, 1)), end: new Date(Date.UTC(nY, nM, lastDayOfUtcMonth(nY, nM))) };
  }
  if (sD === 1 && eD === 15) {
    return { start: new Date(Date.UTC(eY, eM, 16)), end: new Date(Date.UTC(eY, eM, eLastDay)) };
  }
  if (sD === 16) {
    const nY = eM === 11 ? eY + 1 : eY;
    const nM = (eM + 1) % 12;
    return { start: new Date(Date.UTC(nY, nM, 1)), end: new Date(Date.UTC(nY, nM, 15)) };
  }
  const dayAfter = new Date(end.getTime() + 86400000);
  const nY = dayAfter.getUTCFullYear();
  const nM = dayAfter.getUTCMonth();
  return { start: dayAfter, end: new Date(Date.UTC(nY, nM, lastDayOfUtcMonth(nY, nM))) };
}

export async function closePeriod(periodId: number, closedBy: string): Promise<PeriodClosingResult> {
  const period = await prisma.sysPeriod.findUnique({ where: { PeriodID: periodId } });
  if (!period) throw new Error("PERIOD_NOT_FOUND");
  if (period.Status === "CLOSED") throw new Error("PERIOD_ALREADY_CLOSED");

  const lock = await prisma.trnPayrollLock.findFirst({ where: { PeriodID: periodId }, orderBy: { LockID: "desc" } });
  if (!lock || !lock.IsLocked) throw new Error("PERIOD_NOT_LOCKED");
  if (!lock.IsApproved) throw new Error("PERIOD_NOT_APPROVED");

  const transactions = await prisma.trnPayrollTransaction.findMany({ where: { PeriodID: periodId }, select: { TransactionID: true } });

  // Precompute every debt's settlement amount for this period BEFORE opening
  // the write transaction — getRationedDeductionBreakdown() reads via the
  // plain `prisma` client (not a $transaction client), same "read via
  // helper, write via `t`" split runPayrollCalculate() already uses above.
  // Safe to read this way because the period is locked: nothing about
  // GrossWage/Tax/SSO/detail lines can change while locked, so this is
  // exactly the same breakdown the "ยอดจากการคำนวน" column already showed.
  const debtDeltas = new Map<number, Prisma.Decimal>();
  for (const t of transactions) {
    const { items } = await getRationedDeductionBreakdown(t.TransactionID);
    for (const item of items) {
      if (item.source !== "install" || item.allocated.lte(0)) continue;
      const debtId = Number(item.key.slice("debt:".length));
      debtDeltas.set(debtId, (debtDeltas.get(debtId) ?? new Prisma.Decimal(0)).add(item.allocated));
    }
  }

  const nextRange = computeNextPeriodRange(period.StartDate, period.EndDate);
  const payDateGapMs = period.PayDate.getTime() - period.EndDate.getTime();

  return prisma.$transaction(async (tx) => {
    let debtsSettled = 0;
    for (const [debtId, delta] of debtDeltas) {
      const debt = await tx.invEmployeeDebt.findUnique({ where: { DebtID: debtId } });
      if (!debt) continue;
      const newRemaining = Prisma.Decimal.max(debt.RemainingAmount.sub(delta), 0);
      await tx.invEmployeeDebt.update({
        where: { DebtID: debtId },
        data: {
          RemainingAmount: newRemaining,
          PaidAmount: debt.PaidAmount.add(delta),
          Status: newRemaining.lte(0) ? "CLOSED" : debt.Status,
          UpdatedBy: closedBy,
          UpdatedDate: new Date(),
        },
      });
      debtsSettled++;
    }

    await tx.sysPeriod.update({
      where: { PeriodID: periodId },
      data: { Status: "CLOSED", IsCurrent: false, UpdatedBy: closedBy, UpdatedDate: new Date() },
    });
    await tx.trnPayrollLock.update({
      where: { LockID: lock.LockID },
      data: { IsLocked: true, LockedBy: closedBy, LockedDate: new Date(), UpdatedBy: closedBy, UpdatedDate: new Date() },
    });

    // "เอางวดปัจจุบันไปงวดถัดไป (ถ้ามีกำหนดไว้) แต่ถ้าไม่มีก็สร้างงวดให้เลย"
    let nextPeriod = await tx.sysPeriod.findFirst({ where: { EmployeeType: period.EmployeeType, StartDate: nextRange.start } });
    let nextPeriodCreated = false;
    if (nextPeriod) {
      await tx.sysPeriod.update({ where: { PeriodID: nextPeriod.PeriodID }, data: { IsCurrent: true, UpdatedBy: closedBy, UpdatedDate: new Date() } });
    } else {
      nextPeriod = await tx.sysPeriod.create({
        data: {
          EmployeeType: period.EmployeeType,
          PeriodYear: nextRange.start.getUTCFullYear(),
          PeriodMonth: nextRange.start.getUTCMonth() + 1,
          StartDate: nextRange.start,
          EndDate: nextRange.end,
          PayDate: new Date(nextRange.end.getTime() + payDateGapMs),
          IsCurrent: true,
          CreatedBy: closedBy,
        },
      });
      nextPeriodCreated = true;
    }

    return { debtsSettled, nextPeriodId: nextPeriod.PeriodID, nextPeriodCreated };
  });
}
