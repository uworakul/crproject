import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import Tabs from "../tabs";
import ReferenceTable, { type FieldDef } from "../reference-table";

const bracketFields: FieldDef[] = [
  { key: "BracketID", label: "ID", type: "text", isKey: true },
  { key: "EffectiveYear", label: "ปี พ.ศ.", type: "year" },
  { key: "IncomeFrom", label: "เงินได้ตั้งแต่ (บาท)", type: "number" },
  { key: "IncomeTo", label: "เงินได้ถึง (บาท)", type: "number" },
  { key: "TaxRate", label: "อัตราภาษี (%)", type: "percent" },
];
const deductionFields: FieldDef[] = [
  { key: "DeductionCode", label: "รหัส", type: "text", isKey: true, hidden: true },
  { key: "DeductionName", label: "รายการ", type: "text" },
  { key: "Rate", label: "อัตรา%", type: "percent" },
  { key: "MaxAmount", label: "วงเงินสูงสุด (บาท)", type: "number" },
  { key: "EffectiveYear", label: "ปี พ.ศ.", type: "number", hidden: true },
];
const ssoFields: FieldDef[] = [
  { key: "SSOBaseID", label: "ID", type: "text", isKey: true },
  { key: "EffectiveYear", label: "ปี พ.ศ.", type: "year" },
  { key: "EffectiveDate", label: "วันที่มีผลบังคับใช้", type: "date" },
  { key: "MinBase", label: "ฐานต่ำสุด (บาท)", type: "number" },
  { key: "MaxBase", label: "ฐานสูงสุด (บาท)", type: "number" },
  { key: "EmployeeRate", label: "อัตราลูกจ้าง (%)", type: "percent" },
  { key: "EmployerRate", label: "อัตรานายจ้าง (%)", type: "percent" },
];
const welfareFundFields: FieldDef[] = [
  { key: "WelfareFundID", label: "ID", type: "text", isKey: true },
  { key: "EffectiveYear", label: "ปี พ.ศ.", type: "year" },
  { key: "EffectiveDate", label: "วันที่มีผลบังคับใช้", type: "date" },
  { key: "EmployeeRate", label: "อัตราลูกจ้าง (%)", type: "percent" },
  { key: "EmployerRate", label: "อัตรานายจ้าง (%)", type: "percent" },
];

export default async function TaxRatePage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "TAX_RATE", "read");
  if (!canRead) redirect("/");

  const [canSave, canDelete, bracketsRaw, deductionsRaw, ssoBaseRaw, welfareFundRaw] = await Promise.all([
    hasPermission(user, "TAX_RATE", "save"),
    hasPermission(user, "TAX_RATE", "delete"),
    prisma.refTaxBracket.findMany({ orderBy: [{ EffectiveYear: "desc" }, { IncomeFrom: "asc" }] }),
    prisma.refDeductionRate.findMany({ orderBy: [{ SortOrder: "asc" }, { DeductionCode: "asc" }] }),
    prisma.refSsoBase.findMany({ orderBy: { EffectiveYear: "desc" } }),
    prisma.refWelfareFund.findMany({ orderBy: { EffectiveYear: "desc" } }),
  ]);

  const [brackets, deductions, ssoBase, welfareFund] = JSON.parse(
    JSON.stringify([bracketsRaw, deductionsRaw, ssoBaseRaw, welfareFundRaw]),
  );

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">ภาษี/ค่าลดหย่อน/กองทุนฯ</h1>
      <Tabs
        tabs={[
          {
            label: "ขั้นภาษี",
            content: (
              <ReferenceTable
                key="/api/reference/tax-brackets"
                apiBase="/api/reference/tax-brackets"
                fields={bracketFields}
                canSave={canSave}
                canDelete={canDelete}
                initialRows={brackets}
              />
            ),
          },
          {
            label: "ค่าลดหย่อน",
            content: (
              <ReferenceTable
                key="/api/reference/deduction-rates"
                apiBase="/api/reference/deduction-rates"
                fields={deductionFields}
                hasIsActive={false}
                canSave={canSave}
                canDelete={false}
                allowAdd={false}
                showSearch={false}
                sortable={false}
                showRowNumber
                initialRows={deductions}
              />
            ),
          },
          {
            label: "ฐานประกันสังคม",
            content: (
              <ReferenceTable
                key="/api/reference/sso-base"
                apiBase="/api/reference/sso-base"
                fields={ssoFields}
                canSave={canSave}
                canDelete={canDelete}
                initialRows={ssoBase}
              />
            ),
          },
          {
            label: "กองทุนสงเคราะห์พนักงาน",
            content: (
              <ReferenceTable
                key="/api/reference/welfare-fund"
                apiBase="/api/reference/welfare-fund"
                fields={welfareFundFields}
                canSave={canSave}
                canDelete={canDelete}
                initialRows={welfareFund}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
