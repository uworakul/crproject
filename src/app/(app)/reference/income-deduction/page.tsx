import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import Tabs from "../tabs";
import ReferenceTable, { type FieldDef } from "../reference-table";

const incomeFields: FieldDef[] = [
  { key: "IncomeCode", label: "รหัสรายได้", type: "text", isKey: true },
  { key: "IncomeName", label: "ชื่อรายได้", type: "text" },
];
const deductionFields: FieldDef[] = [
  { key: "DeductionCode", label: "รหัสรายการหัก", type: "text", isKey: true },
  { key: "DeductionName", label: "ชื่อรายการหัก", type: "text" },
  { key: "IsInstallment", label: "หักเป็นงวด", type: "checkbox" },
  { key: "IsAutoCalculated", label: "คำนวณอัตโนมัติ", type: "checkbox" },
];

export default async function IncomeDeductionPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  // Split into two DocumentTypes (2026-09-28, permission redesign) — a
  // user can now have read/save/delete on one tab without the other. Page
  // itself only needs READ on at least one to be worth showing at all;
  // each <ReferenceTable> below gates its own save/delete independently.
  const [canReadIncome, canReadDeduction] = await Promise.all([
    hasPermission(user, "INCOME_TYPE", "read"),
    hasPermission(user, "DEDUCTION_TYPE", "read"),
  ]);
  if (!canReadIncome && !canReadDeduction) redirect("/");

  const [canSaveIncome, canDeleteIncome, canSaveDeduction, canDeleteDeduction, incomeTypesRaw, deductionTypesRaw] = await Promise.all([
    hasPermission(user, "INCOME_TYPE", "save"),
    hasPermission(user, "INCOME_TYPE", "delete"),
    hasPermission(user, "DEDUCTION_TYPE", "save"),
    hasPermission(user, "DEDUCTION_TYPE", "delete"),
    prisma.refIncomeType.findMany({ orderBy: { IncomeCode: "asc" } }),
    prisma.refDeductionType.findMany({ orderBy: { DeductionCode: "asc" } }),
  ]);

  const [incomeTypes, deductionTypes] = JSON.parse(JSON.stringify([incomeTypesRaw, deductionTypesRaw]));

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">รายได้และรายการหัก</h1>
      <Tabs
        tabs={[
          {
            label: "รายได้",
            content: (
              <ReferenceTable
                key="/api/reference/income-types"
                apiBase="/api/reference/income-types"
                fields={incomeFields}
                canSave={canSaveIncome}
                canDelete={canDeleteIncome}
                allowExport
                allowImport
                initialRows={incomeTypes}
              />
            ),
          },
          {
            label: "รายการหัก",
            content: (
              <ReferenceTable
                key="/api/reference/deduction-types"
                apiBase="/api/reference/deduction-types"
                fields={deductionFields}
                canSave={canSaveDeduction}
                canDelete={canDeleteDeduction}
                allowExport
                allowImport
                initialRows={deductionTypes}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
