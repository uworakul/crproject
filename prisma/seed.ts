import "dotenv/config";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "../generated/prisma/client";
import { menuSeed } from "./seed-menus";

// Not importing src/lib/password.ts here: it's guarded with `server-only`,
// which throws when run outside the Next.js bundler (e.g. via `tsx` here).
function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

const adapter = new PrismaMssql(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function seedMenus() {
  for (const menu of menuSeed) {
    await prisma.sysMenu.upsert({
      where: { DocumentType: menu.DocumentType },
      update: { MenuNameTH: menu.MenuNameTH, MenuNameEN: menu.MenuNameEN, ModuleGroup: menu.ModuleGroup },
      create: menu,
    });
  }
  console.log(`Seeded/updated ${menuSeed.length} sys_menu rows.`);
}

// D/N/D-N/F and their pay multipliers — fixed by FSD/BRD (Design - Worksheet
// sheet), not a business decision to invent: D=1.0, N=1.0, D-N=2.0, F=0.0.
const attendanceCodeSeed = [
  { Code: "D", CodeNameTH: "กะกลางวัน", CodeNameEN: "Day Shift", PayMultiplier: "1.0", SortOrder: 1 },
  { Code: "N", CodeNameTH: "กะกลางคืน", CodeNameEN: "Night Shift", PayMultiplier: "1.0", SortOrder: 2 },
  { Code: "D-N", CodeNameTH: "ควบ 2 กะ", CodeNameEN: "Double Shift", PayMultiplier: "2.0", SortOrder: 3 },
  { Code: "F", CodeNameTH: "วันหยุด", CodeNameEN: "Off/Holiday", PayMultiplier: "0.0", SortOrder: 4 },
];

async function seedAttendanceCodes() {
  for (const code of attendanceCodeSeed) {
    await prisma.mstAttendanceCode.upsert({
      where: { Code: code.Code },
      update: {
        CodeNameTH: code.CodeNameTH,
        CodeNameEN: code.CodeNameEN,
        PayMultiplier: code.PayMultiplier,
        SortOrder: code.SortOrder,
      },
      create: code,
    });
  }
  console.log(`Seeded/updated ${attendanceCodeSeed.length} mst_attendance_code rows.`);
}

// Verified 2026 rates via WebSearch (2026-09-17) against QuickBooks/Statrys/
// TaxAtlas tax-table summaries and Acclime/HLB/RLC SSO-change coverage — not
// invented. Progressive PIT brackets (0/5/10/15/20/25/30/35%) are unchanged
// for 2026; the SSO ceiling rose from 15,000 to 17,500 THB/month effective
// January 2026 (Phase 1 of a multi-year increase), rate stays 5%/5%. Personal
// allowance (60,000 THB) is the ONLY deduction seeded here, matching the
// approved scope for this pass — the separate 50%-of-income/100,000-cap
// expense deduction is NOT included (see CLAUDE.md "Payroll Calculate").
const TAX_YEAR = 2026;
const taxBracketSeed = [
  { IncomeFrom: "0", IncomeTo: "150000", TaxRate: "0.00" },
  { IncomeFrom: "150000.01", IncomeTo: "300000", TaxRate: "0.05" },
  { IncomeFrom: "300000.01", IncomeTo: "500000", TaxRate: "0.10" },
  { IncomeFrom: "500000.01", IncomeTo: "750000", TaxRate: "0.15" },
  { IncomeFrom: "750000.01", IncomeTo: "1000000", TaxRate: "0.20" },
  { IncomeFrom: "1000000.01", IncomeTo: "2000000", TaxRate: "0.25" },
  { IncomeFrom: "2000000.01", IncomeTo: "5000000", TaxRate: "0.30" },
  { IncomeFrom: "5000000.01", IncomeTo: "999999999.99", TaxRate: "0.35" },
];

async function seedPayrollRates() {
  const existingBrackets = await prisma.refTaxBracket.findFirst({ where: { EffectiveYear: TAX_YEAR } });
  if (!existingBrackets) {
    await prisma.refTaxBracket.createMany({ data: taxBracketSeed.map((b) => ({ ...b, EffectiveYear: TAX_YEAR })) });
    console.log(`Seeded ${taxBracketSeed.length} ref_tax_bracket rows for ${TAX_YEAR}.`);
  } else {
    console.log(`ref_tax_bracket seed skipped: rows for ${TAX_YEAR} already exist.`);
  }

  const existingSso = await prisma.refSsoBase.findFirst({ where: { EffectiveYear: TAX_YEAR } });
  if (!existingSso) {
    await prisma.refSsoBase.create({
      data: { EffectiveYear: TAX_YEAR, MinBase: "1650", MaxBase: "17500", EmployeeRate: "0.05", EmployerRate: "0.05" },
    });
    console.log(`Seeded ref_sso_base row for ${TAX_YEAR}.`);
  } else {
    console.log(`ref_sso_base seed skipped: a row for ${TAX_YEAR} already exists.`);
  }

  await prisma.refDeductionRate.upsert({
    where: { DeductionCode: "PERSONAL" },
    update: { DeductionName: "ค่าลดหย่อนส่วนตัว", MaxAmount: "60000", EffectiveYear: TAX_YEAR },
    create: { DeductionCode: "PERSONAL", DeductionName: "ค่าลดหย่อนส่วนตัว", MaxAmount: "60000", EffectiveYear: TAX_YEAR },
  });
  console.log("Seeded/updated ref_deduction_rate 'PERSONAL' row.");
}

async function main() {
  await seedMenus();
  await seedAttendanceCodes();
  await seedPayrollRates();

  const existing = await prisma.sysUser.findUnique({ where: { UserID: "admin" } });
  if (existing) {
    console.log("Admin user seed skipped: sys_user 'admin' already exists.");
    return;
  }

  const generatedPassword = randomBytes(9).toString("base64url"); // dev bootstrap only
  const passwordHash = await hashPassword(generatedPassword);

  await prisma.sysUser.create({
    data: {
      UserID: "admin",
      PasswordHash: passwordHash,
      DisplayName: "System Administrator",
      Role: "ADMIN",
    },
  });

  console.log("Seeded initial admin account:");
  console.log("  UserID:  admin");
  console.log(`  Password: ${generatedPassword}`);
  console.log("Save this password now — it is not stored anywhere else. Change it after first login.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
