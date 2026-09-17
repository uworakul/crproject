import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import Tabs from "./tabs";
import ReferenceTable, { type FieldDef } from "./reference-table";

const bankFields: FieldDef[] = [
  { key: "BankCode", label: "รหัสธนาคาร", type: "text", isKey: true },
  { key: "BankNameTH", label: "ชื่อ (ไทย)", type: "text" },
  { key: "BankNameEN", label: "ชื่อ (English)", type: "text" },
];
const deptFields: FieldDef[] = [
  { key: "DeptCode", label: "รหัสแผนก", type: "text", isKey: true },
  { key: "DeptName", label: "ชื่อแผนก", type: "text" },
];
const positionFields: FieldDef[] = [
  { key: "PositionCode", label: "รหัสตำแหน่ง", type: "text", isKey: true },
  { key: "PositionName", label: "ชื่อตำแหน่ง", type: "text" },
  { key: "PositionAllowance", label: "เงินตำแหน่ง (บาท)", type: "number" },
];
const ssoFields: FieldDef[] = [
  { key: "SSOBaseID", label: "ID", type: "text", isKey: true },
  { key: "EffectiveYear", label: "ปี พ.ศ.", type: "number" },
  { key: "MinBase", label: "ฐานต่ำสุด (บาท)", type: "number" },
  { key: "MaxBase", label: "ฐานสูงสุด (บาท)", type: "number" },
  { key: "EmployeeRate", label: "อัตราลูกจ้าง (%)", type: "percent" },
  { key: "EmployerRate", label: "อัตรานายจ้าง (%)", type: "percent" },
];
const blacklistFields: FieldDef[] = [
  { key: "BlackListID", label: "ID", type: "text", isKey: true },
  { key: "IDCardNo", label: "เลขบัตรประชาชน", type: "text" },
  { key: "FullName", label: "ชื่อ-นามสกุล", type: "text" },
  { key: "Reason", label: "เหตุผล", type: "text" },
];

export default async function ReferencePage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "REFERENCE", "read");
  if (!canRead) redirect("/");

  const [canSave, canDelete, banksRaw, departmentsRaw, positionsRaw, ssoBaseRaw, blacklistRaw] = await Promise.all([
    hasPermission(user, "REFERENCE", "save"),
    hasPermission(user, "REFERENCE", "delete"),
    prisma.refBank.findMany({ orderBy: { BankCode: "asc" } }),
    prisma.refDepartment.findMany({ orderBy: { DeptCode: "asc" } }),
    prisma.refPosition.findMany({ orderBy: { PositionCode: "asc" } }),
    prisma.refSsoBase.findMany({ orderBy: { EffectiveYear: "desc" } }),
    prisma.refBlackList.findMany({ orderBy: { AddedDate: "desc" } }),
  ]);

  // Prisma.Decimal fields (PositionAllowance, MinBase/MaxBase, rates) aren't
  // plain objects React Server Components can pass to a Client Component —
  // round-trip through JSON so Decimal.toJSON() turns them into strings.
  const [banks, departments, positions, ssoBase, blacklist] = JSON.parse(
    JSON.stringify([banksRaw, departmentsRaw, positionsRaw, ssoBaseRaw, blacklistRaw]),
  );

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">รหัสอ้างอิง</h1>
      <Tabs
        tabs={[
          {
            label: "ธนาคาร",
            content: (
              <ReferenceTable apiBase="/api/reference/banks" fields={bankFields} hasIsActive canSave={canSave} canDelete={canDelete} initialRows={banks} />
            ),
          },
          {
            label: "แผนก",
            content: (
              <ReferenceTable
                apiBase="/api/reference/departments"
                fields={deptFields}
                hasIsActive
                canSave={canSave}
                canDelete={canDelete}
                initialRows={departments}
              />
            ),
          },
          {
            label: "ตำแหน่ง",
            content: (
              <ReferenceTable
                apiBase="/api/reference/positions"
                fields={positionFields}
                hasIsActive
                canSave={canSave}
                canDelete={canDelete}
                initialRows={positions}
              />
            ),
          },
          {
            label: "ฐานประกันสังคม",
            content: (
              <ReferenceTable apiBase="/api/reference/sso-base" fields={ssoFields} canSave={canSave} canDelete={canDelete} initialRows={ssoBase} />
            ),
          },
          {
            label: "บัญชีดำ",
            content: (
              <ReferenceTable
                apiBase="/api/reference/blacklist"
                fields={blacklistFields}
                canSave={canSave}
                canDelete={canDelete}
                initialRows={blacklist}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
