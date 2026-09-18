import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import Tabs from "./tabs";
import ReferenceTable, { type FieldDef } from "./reference-table";

const companyFields: FieldDef[] = [
  { key: "CompanyCode", label: "รหัสบริษัท", type: "text", isKey: true },
  { key: "CompanyName", label: "ชื่อ", type: "text" },
  { key: "Address", label: "ที่อยู่", type: "text" },
  { key: "TaxID", label: "เลขประจำตัวภาษี", type: "text" },
  { key: "SSORegistNo", label: "เลขประจำตัวปกส", type: "text" },
  { key: "ContactPhone", label: "เบอร์ติดต่อ", type: "text" },
];
const bankFields: FieldDef[] = [
  { key: "BankCode", label: "รหัสธนาคาร", type: "text", isKey: true },
  { key: "BankNameTH", label: "ชื่อ", type: "text" },
];
const deptFields: FieldDef[] = [
  { key: "DeptCode", label: "รหัสแผนก", type: "text", isKey: true },
  { key: "DeptName", label: "ชื่อแผนก", type: "text" },
];
const positionFields: FieldDef[] = [
  { key: "PositionCode", label: "รหัสตำแหน่ง", type: "text", isKey: true },
  { key: "PositionName", label: "ชื่อตำแหน่ง", type: "text" },
];
const blacklistFields: FieldDef[] = [
  { key: "BlackListID", label: "ID", type: "text", isKey: true, hidden: true },
  { key: "IDCardNo", label: "รหัสแบล็คลิส", type: "text" },
  { key: "FullName", label: "รายละเอียด", type: "text" },
];
const ssoFields: FieldDef[] = [
  { key: "SSOBaseID", label: "ID", type: "text", isKey: true },
  { key: "EffectiveYear", label: "ปี พ.ศ.", type: "number" },
  { key: "EffectiveDate", label: "วันที่มีผลบังคับใช้", type: "date" },
  { key: "MinBase", label: "ฐานต่ำสุด (บาท)", type: "number" },
  { key: "MaxBase", label: "ฐานสูงสุด (บาท)", type: "number" },
  { key: "EmployeeRate", label: "อัตราลูกจ้าง (%)", type: "percent" },
  { key: "EmployerRate", label: "อัตรานายจ้าง (%)", type: "percent" },
];

export default async function ReferencePage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "REFERENCE", "read");
  if (!canRead) redirect("/");

  const [canSave, canDelete, companiesRaw, banksRaw, departmentsRaw, positionsRaw, blacklistRaw, ssoBaseRaw] = await Promise.all([
    hasPermission(user, "REFERENCE", "save"),
    hasPermission(user, "REFERENCE", "delete"),
    prisma.refCompany.findMany({ orderBy: { CompanyCode: "asc" } }),
    prisma.refBank.findMany({ orderBy: { BankCode: "asc" } }),
    prisma.refDepartment.findMany({ orderBy: { DeptCode: "asc" } }),
    prisma.refPosition.findMany({ orderBy: { PositionCode: "asc" } }),
    prisma.refBlackList.findMany({ orderBy: { AddedDate: "desc" } }),
    prisma.refSsoBase.findMany({ orderBy: { EffectiveYear: "desc" } }),
  ]);

  // Prisma.Decimal fields (PositionAllowance, MinBase/MaxBase, rates) aren't
  // plain objects React Server Components can pass to a Client Component —
  // round-trip through JSON so Decimal.toJSON() turns them into strings.
  const [companies, banks, departments, positions, blacklist, ssoBase] = JSON.parse(
    JSON.stringify([companiesRaw, banksRaw, departmentsRaw, positionsRaw, blacklistRaw, ssoBaseRaw]),
  );

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">รหัสอ้างอิงหลัก</h1>
      <Tabs
        tabs={[
          {
            label: "บริษัท",
            content: (
              <ReferenceTable
                key="/api/reference/company"
                apiBase="/api/reference/company"
                fields={companyFields}
                canSave={canSave}
                canDelete={canDelete}
                initialRows={companies}
              />
            ),
          },
          {
            label: "ธนาคาร",
            content: (
              <ReferenceTable
                key="/api/reference/banks"
                apiBase="/api/reference/banks"
                fields={bankFields}
                canSave={canSave}
                canDelete={canDelete}
                initialRows={banks}
              />
            ),
          },
          {
            label: "แผนก",
            content: (
              <ReferenceTable
                key="/api/reference/departments"
                apiBase="/api/reference/departments"
                fields={deptFields}
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
                key="/api/reference/positions"
                apiBase="/api/reference/positions"
                fields={positionFields}
                canSave={canSave}
                canDelete={canDelete}
                initialRows={positions}
              />
            ),
          },
          {
            label: "Blacklist",
            content: (
              <ReferenceTable
                key="/api/reference/blacklist"
                apiBase="/api/reference/blacklist"
                fields={blacklistFields}
                canSave={canSave}
                canDelete={canDelete}
                initialRows={blacklist}
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
        ]}
      />
    </div>
  );
}
