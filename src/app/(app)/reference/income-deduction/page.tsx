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

  const canRead = await hasPermission(user, "INCOME_DEDUCTION", "read");
  if (!canRead) redirect("/");

  const [canSave, canDelete, incomeTypesRaw, deductionTypesRaw] = await Promise.all([
    hasPermission(user, "INCOME_DEDUCTION", "save"),
    hasPermission(user, "INCOME_DEDUCTION", "delete"),
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
                canSave={canSave}
                canDelete={canDelete}
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
                canSave={canSave}
                canDelete={canDelete}
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
