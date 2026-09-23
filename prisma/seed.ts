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

// Standard Thai bank short-codes — same convention already used by the
// existing KBANK/SCB rows (not the 3-digit BOT numeric codes). Verified via
// WebSearch 2026-09-24 against payout/SWIFT bank-code references, not
// invented — covers CASH plus every major commercial + state bank used in
// Thai payroll systems.
const bankSeed = [
  { BankCode: "CASH", BankNameTH: "เงินสด", BankNameEN: "เงินสด" },
  { BankCode: "BBL", BankNameTH: "กรุงเทพ", BankNameEN: "Bangkok Bank" },
  { BankCode: "KBANK", BankNameTH: "กสิกรไทย", BankNameEN: "Kasikornbank" },
  { BankCode: "KTB", BankNameTH: "กรุงไทย", BankNameEN: "Krungthai Bank" },
  { BankCode: "SCB", BankNameTH: "ไทยพาณิชย์", BankNameEN: "Siam Commercial Bank" },
  { BankCode: "BAY", BankNameTH: "กรุงศรีอยุธยา", BankNameEN: "Bank of Ayudhya" },
  { BankCode: "TTB", BankNameTH: "ทหารไทยธนชาต", BankNameEN: "TMBThanachart Bank" },
  { BankCode: "GSB", BankNameTH: "ออมสิน", BankNameEN: "Government Savings Bank" },
  { BankCode: "BAAC", BankNameTH: "ธ.ก.ส.", BankNameEN: "Bank for Agriculture and Agricultural Cooperatives" },
  { BankCode: "CIMBT", BankNameTH: "ซีไอเอ็มบีไทย", BankNameEN: "CIMB Thai Bank" },
  { BankCode: "KKP", BankNameTH: "เกียรตินาคินภัทร", BankNameEN: "Kiatnakin Phatra Bank" },
  { BankCode: "LHBANK", BankNameTH: "แลนด์ แอนด์ เฮ้าส์", BankNameEN: "Land and Houses Bank" },
  { BankCode: "TISCO", BankNameTH: "ทิสโก้", BankNameEN: "TISCO Bank" },
  { BankCode: "UOBT", BankNameTH: "ยูโอบี", BankNameEN: "United Overseas Bank (Thai)" },
  { BankCode: "ISBT", BankNameTH: "อิสลามแห่งประเทศไทย", BankNameEN: "Islamic Bank of Thailand" },
];

async function seedBanks() {
  for (const bank of bankSeed) {
    await prisma.refBank.upsert({
      where: { BankCode: bank.BankCode },
      update: {},
      create: bank,
    });
  }
  console.log(`Seeded/updated ${bankSeed.length} ref_bank rows.`);
}

// Org structure/job-title/income-deduction-category conventions below are
// NOT invented — copied from the real, working configuration in the
// production tenant (ABC/WINTHER GUARD, a real security-guard company using
// this system), per the user's explicit direction 2026-09-24 that every
// client in this business runs the same structure. Codes/names match that
// tenant exactly so a new client's screens look the same on day one; all
// freely editable afterward via the UI.
const departmentSeed = [
  { DeptCode: "001", DeptName: "บริหาร" },
  { DeptCode: "002", DeptName: "บุคคล" },
  { DeptCode: "003", DeptName: "ธุรการ" },
  { DeptCode: "004", DeptName: "การเงิน" },
  { DeptCode: "005", DeptName: "บัญชี" },
  { DeptCode: "006", DeptName: "แอดมิน" },
  { DeptCode: "007", DeptName: "ปฏิบัติการ/สายตรวจ" },
  { DeptCode: "008", DeptName: "รปภ" },
  { DeptCode: "009", DeptName: "ทำความสะอาด" },
  { DeptCode: "010", DeptName: "แม่บ้าน" },
];

async function seedDepartments() {
  for (const dept of departmentSeed) {
    await prisma.refDepartment.upsert({ where: { DeptCode: dept.DeptCode }, update: {}, create: dept });
  }
  console.log(`Seeded/updated ${departmentSeed.length} ref_department rows.`);
}

const positionSeed = [
  { PositionCode: "101", PositionName: "กรรมการผู้จัดการ" },
  { PositionCode: "102", PositionName: "รองกรรมการ" },
  { PositionCode: "103", PositionName: "ผู้จัดการทั่วไป" },
  { PositionCode: "104", PositionName: "ฝ่ายบุคคล" },
  { PositionCode: "105", PositionName: "บัญชี" },
  { PositionCode: "106", PositionName: "ธุรการ" },
  { PositionCode: "107", PositionName: "แอดมิน" },
  { PositionCode: "108", PositionName: "ผู้จัดการฝ่ายปฏิบัติการ" },
  { PositionCode: "109", PositionName: "ฝ่ายปฎิบัติการ" },
  { PositionCode: "110", PositionName: "หัวหน้าหน่วย" },
  { PositionCode: "111", PositionName: "หัวหน้าชุด.รปภ" },
  { PositionCode: "112", PositionName: "รปภ" },
  { PositionCode: "113", PositionName: "หัวหน้าแม่บ้าน" },
  { PositionCode: "114", PositionName: "แม่บ้าน" },
  { PositionCode: "115", PositionName: "คนสวน" },
];

async function seedPositions() {
  for (const pos of positionSeed) {
    await prisma.refPosition.upsert({
      where: { PositionCode: pos.PositionCode },
      update: {},
      create: { ...pos, PositionAllowance: "0" },
    });
  }
  console.log(`Seeded/updated ${positionSeed.length} ref_position rows.`);
}

const incomeTypeSeed = [
  { IncomeCode: "01", IncomeName: "ค่าแรง" },
  { IncomeCode: "02", IncomeName: "เงินเดือน" },
  { IncomeCode: "03", IncomeName: "ค่าแรงวันหยุด" },
  { IncomeCode: "04", IncomeName: "ค่าแรงวันลา" },
  { IncomeCode: "05", IncomeName: "โอที 1" },
  { IncomeCode: "06", IncomeName: "โอที 1.25" },
  { IncomeCode: "07", IncomeName: "โอที 1.5" },
  { IncomeCode: "08", IncomeName: "โอที 2" },
  { IncomeCode: "09", IncomeName: "โอที 2.5" },
  { IncomeCode: "10", IncomeName: "โอที 3" },
  { IncomeCode: "11", IncomeName: "โอทีเหมา" },
  { IncomeCode: "12", IncomeName: "เบี้ยขยัน" },
  { IncomeCode: "13", IncomeName: "เบี้ยเลี้ยง" },
  { IncomeCode: "14", IncomeName: "จ่ายย้อนหลัง" },
  { IncomeCode: "15", IncomeName: "ค่าตำแหน่ง" },
  { IncomeCode: "16", IncomeName: "ค่าจุด" },
  { IncomeCode: "17", IncomeName: "ค่าอาหาร" },
  { IncomeCode: "18", IncomeName: "โบนัส" },
  { IncomeCode: "19", IncomeName: "ค่านำพา" },
  { IncomeCode: "20", IncomeName: "ค่าโทร" },
  { IncomeCode: "21", IncomeName: "ค่าน้ำมัน / ค่ารถ /ค่าเดินทาง" },
  { IncomeCode: "22", IncomeName: "ค่าที่พัก" },
  { IncomeCode: "23", IncomeName: "อื่นๆ" },
];

async function seedIncomeTypes() {
  for (const income of incomeTypeSeed) {
    await prisma.refIncomeType.upsert({ where: { IncomeCode: income.IncomeCode }, update: {}, create: income });
  }
  console.log(`Seeded/updated ${incomeTypeSeed.length} ref_income_type rows.`);
}

// IsAutoCalculated=true (03/04/05) means Payroll Calculate fills these in
// itself — kept out of the manual-entry dropdown on the "รายการประจำงวด"
// screen (src/app/(app)/payroll/transactions), same as production. The
// ADVANCE/ADVANCEN/ADVANCEU/LOAN/TRAINING/UNIFORM alpha codes are also
// auto-provisioned the first time their feature is used (Request/Inventory
// modules) — seeded here too just so the "รายการหัก" screen shows the full
// picture immediately instead of filling in gradually as features get used.
const deductionTypeSeed = [
  { DeductionCode: "01", DeductionName: "สาย", IsInstallment: false, IsAutoCalculated: false },
  { DeductionCode: "02", DeductionName: "ขาดงาน", IsInstallment: false, IsAutoCalculated: false },
  { DeductionCode: "03", DeductionName: "ประกันสังคม", IsInstallment: false, IsAutoCalculated: true },
  { DeductionCode: "04", DeductionName: "กองทุนสงเคราะห์พนักงาน", IsInstallment: false, IsAutoCalculated: true },
  { DeductionCode: "05", DeductionName: "ภาษี", IsInstallment: false, IsAutoCalculated: true },
  { DeductionCode: "06", DeductionName: "ค่าเสียหาย", IsInstallment: true, IsAutoCalculated: false },
  { DeductionCode: "07", DeductionName: "ค่าปรับ", IsInstallment: true, IsAutoCalculated: false },
  { DeductionCode: "08", DeductionName: "ค่าชุด/ค่าบัตร", IsInstallment: true, IsAutoCalculated: false },
  { DeductionCode: "09", DeductionName: "เงินประกัน", IsInstallment: true, IsAutoCalculated: false },
  { DeductionCode: "10", DeductionName: "ค่าอบรม", IsInstallment: true, IsAutoCalculated: false },
  { DeductionCode: "11", DeductionName: "เงินสะสม", IsInstallment: true, IsAutoCalculated: false },
  { DeductionCode: "12", DeductionName: "เงินกู้", IsInstallment: true, IsAutoCalculated: false },
  { DeductionCode: "13", DeductionName: "เงินเบิกล่วงหน้า", IsInstallment: true, IsAutoCalculated: false },
  { DeductionCode: "14", DeductionName: "เงินเบิกพนักงานใหม่", IsInstallment: true, IsAutoCalculated: false },
  { DeductionCode: "15", DeductionName: "เงินเบิกฉุกเฉิน", IsInstallment: true, IsAutoCalculated: false },
  { DeductionCode: "16", DeductionName: "กยศ", IsInstallment: true, IsAutoCalculated: false },
  { DeductionCode: "17", DeductionName: "กรมบังคับคดี", IsInstallment: true, IsAutoCalculated: false },
  { DeductionCode: "18", DeductionName: "อื่นๆ", IsInstallment: false, IsAutoCalculated: false },
  { DeductionCode: "ADVANCE", DeductionName: "เบิกล่วงหน้า", IsInstallment: true, IsAutoCalculated: false },
  { DeductionCode: "ADVANCEN", DeductionName: "เบิกล่วงหน้าพนักงานใหม่", IsInstallment: true, IsAutoCalculated: false },
  { DeductionCode: "ADVANCEU", DeductionName: "เบิกล่วงหน้าฉุกเฉิน", IsInstallment: true, IsAutoCalculated: false },
  { DeductionCode: "LOAN", DeductionName: "เงินกู้", IsInstallment: true, IsAutoCalculated: false },
  { DeductionCode: "TRAINING", DeductionName: "ค่าอบรม", IsInstallment: true, IsAutoCalculated: false },
  { DeductionCode: "UNIFORM", DeductionName: "ค่าชุด", IsInstallment: true, IsAutoCalculated: false },
];

async function seedDeductionTypes() {
  for (const d of deductionTypeSeed) {
    await prisma.refDeductionType.upsert({ where: { DeductionCode: d.DeductionCode }, update: {}, create: d });
  }
  console.log(`Seeded/updated ${deductionTypeSeed.length} ref_deduction_type rows.`);
}

// Document-numbering CONFIGURATION (which codes exist, whether they use a
// ปี+เดือน prefix) is copied from production the same way as above — but
// LatestNumber always starts at 0 here regardless of what production is up
// to, since that's a per-tenant running counter, not shared reference data.
// All of these also auto-provision themselves on first use anyway
// (getOrCreateDocumentNumber in src/lib/document-number.ts) — seeding them
// up front just means a new tenant's numbering FORMAT matches production
// from day one instead of needing someone to configure each one by hand.
const documentNumberSeed = [
  { DocumentCode: "NEW_EMPNO", Description: "รหัสพนักงานใหม่" },
  { DocumentCode: "ADVANCE", Description: "เบิกล่วงหน้า" },
  { DocumentCode: "ADVANCEU", Description: "เบิกล่วงหน้าฉุกเฉิน" },
  { DocumentCode: "LOAN", Description: "เงินกู้" },
  { DocumentCode: "TRAINING", Description: "ค่าอบรม" },
  { DocumentCode: "ADVANCEN", Description: "เบิกล่วงหน้าพนักงานใหม่" },
  { DocumentCode: "UNIFORM", Description: "ค่าเครื่องแบบ" },
  { DocumentCode: "STOCKCOUNT", Description: "นับสต๊อก" },
  { DocumentCode: "STOCKPO", Description: "ซื้อ" },
  { DocumentCode: "STOCKTRF", Description: "โอนสต็อก" },
  { DocumentCode: "STOCKSALE", Description: "ขาย" },
  { DocumentCode: "STOCKRET", Description: "คืน" },
  { DocumentCode: "LEAVE", Description: "ลางาน" },
  { DocumentCode: "PAYROLL", Description: "ใบจ่ายเงินเดือน" },
];

async function seedDocumentNumbers() {
  for (const d of documentNumberSeed) {
    await prisma.refDocumentNumber.upsert({
      where: { DocumentCode: d.DocumentCode },
      update: {},
      create: { ...d, UseYearMonthPrefix: true, IsCustomNumber: false, LatestNumber: 0 },
    });
  }
  console.log(`Seeded/updated ${documentNumberSeed.length} ref_document_number rows.`);
}

// Product categories + a starter 2-warehouse structure (HQ/Branch) — generic
// enough that every client plausibly wants them, unlike actual suppliers or
// SKU-level products (real vendor relationships / real garment sizes &
// prices), which are genuine per-client business decisions and are
// deliberately NOT seeded — same reasoning already applied to ref_company.
const productCategorySeed = [
  { CategoryCode: "01", CategoryName: "เสื้อ" },
  { CategoryCode: "02", CategoryName: "กางเกง" },
];
const warehouseSeed = [
  { WarehouseCode: "01", WarehouseName: "สนญ" },
  { WarehouseCode: "02", WarehouseName: "สาขา" },
];

async function seedInventoryDefaults() {
  for (const c of productCategorySeed) {
    await prisma.invProductCategory.upsert({ where: { CategoryCode: c.CategoryCode }, update: {}, create: c });
  }
  for (const w of warehouseSeed) {
    await prisma.invWarehouse.upsert({ where: { WarehouseCode: w.WarehouseCode }, update: {}, create: w });
  }
  console.log(`Seeded/updated ${productCategorySeed.length} inv_product_category + ${warehouseSeed.length} inv_warehouse rows.`);
}

async function main() {
  await seedMenus();
  await seedAttendanceCodes();
  await seedPayrollRates();
  await seedBanks();
  await seedDepartments();
  await seedPositions();
  await seedIncomeTypes();
  await seedDeductionTypes();
  await seedDocumentNumbers();
  await seedInventoryDefaults();

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
