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
  constructor(public readonly kind: "TAX_BRACKET" | "SSO_BASE", public readonly year: number) {
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

function computeNetPay(tx: {
  GrossWage: Prisma.Decimal;
  TaxWithheld: Prisma.Decimal;
  SSOAmount: Prisma.Decimal;
  AdvanceDeduct: Prisma.Decimal;
  LoanDeduct: Prisma.Decimal;
  TrainingDeduct: Prisma.Decimal;
  UniformDeduct: Prisma.Decimal;
  OtherIncome: Prisma.Decimal;
  OtherDeduction: Prisma.Decimal;
}): Prisma.Decimal {
  return tx.GrossWage.sub(tx.TaxWithheld)
    .sub(tx.SSOAmount)
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

// BR-030: select EmployeeType + Period (+ optional employee code range),
// "สามารถคำนวณซ้ำได้ตลอด" (re-runnable at will) — each run fully
// recomputes TaxWithheld/SSOAmount/NetPay from the current GrossWage and
// whatever Advance/Loan/Training/Uniform/Other fields are already on the
// row (those are edited separately on the Transaction screen, not owned by
// Calculate itself).
export async function runPayrollCalculate(periodId: number, calculatedBy: string, empCodeFrom?: string, empCodeTo?: string): Promise<CalculateResult> {
  const period = await prisma.sysPeriod.findUnique({ where: { PeriodID: periodId } });
  if (!period) throw new Error("PERIOD_NOT_FOUND");

  const lock = await prisma.trnPayrollLock.findFirst({ where: { PeriodID: periodId, IsLocked: true } });
  if (lock) throw new Error("PERIOD_LOCKED");

  const transactions = await prisma.trnPayrollTransaction.findMany({
    where: {
      PeriodID: periodId,
      ...(empCodeFrom ? { EmpCode: { gte: empCodeFrom } } : {}),
      ...(empCodeTo ? { EmpCode: { lte: empCodeTo } } : {}),
    },
  });

  let totalAmount = new Prisma.Decimal(0);
  const updates = [];
  for (const tx of transactions) {
    const taxWithheld = await calculateTaxWithheld(tx.GrossWage, period.PeriodYear);
    const ssoAmount = await calculateSso(tx.GrossWage, period.PeriodYear);
    const netPay = computeNetPay({ ...tx, TaxWithheld: taxWithheld, SSOAmount: ssoAmount });
    totalAmount = totalAmount.add(netPay);
    updates.push(
      prisma.trnPayrollTransaction.update({
        where: { TransactionID: tx.TransactionID },
        data: { TaxWithheld: taxWithheld, SSOAmount: ssoAmount, NetPay: netPay, UpdatedBy: calculatedBy, UpdatedDate: new Date() },
      }),
    );
  }

  await prisma.$transaction([
    ...updates,
    prisma.trnPayrollCalculateLog.create({
      data: {
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
// Calculate added (TaxWithheld/SSOAmount reset to 0), recomputing NetPay
// from whatever else is on the row, then re-runnable via Calculate again.
export async function cancelPayrollCalculate(periodId: number, calculatedBy: string): Promise<CalculateResult> {
  const period = await prisma.sysPeriod.findUnique({ where: { PeriodID: periodId } });
  if (!period) throw new Error("PERIOD_NOT_FOUND");

  const lock = await prisma.trnPayrollLock.findFirst({ where: { PeriodID: periodId, IsLocked: true } });
  if (lock) throw new Error("PERIOD_LOCKED");

  const transactions = await prisma.trnPayrollTransaction.findMany({ where: { PeriodID: periodId } });

  let totalAmount = new Prisma.Decimal(0);
  const updates = transactions.map((tx) => {
    const netPay = computeNetPay({ ...tx, TaxWithheld: new Prisma.Decimal(0), SSOAmount: new Prisma.Decimal(0) });
    totalAmount = totalAmount.add(netPay);
    return prisma.trnPayrollTransaction.update({
      where: { TransactionID: tx.TransactionID },
      data: { TaxWithheld: 0, SSOAmount: 0, NetPay: netPay, UpdatedBy: calculatedBy, UpdatedDate: new Date() },
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
