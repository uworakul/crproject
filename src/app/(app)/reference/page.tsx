import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import Tabs from "./tabs";
import ReferenceTable, { type FieldDef } from "./reference-table";
import { withNextNumber } from "@/lib/document-number";

const companyFields: FieldDef[] = [
  { key: "CompanyCode", label: "รหัสบริษัท", type: "text", isKey: true },
  { key: "CompanyName", label: "ชื่อ", type: "text" },
  { key: "ShortName", label: "ชื่อย่อ", type: "text" },
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
const documentNumberFields: FieldDef[] = [
  { key: "DocumentNumberID", label: "ID", type: "number", isKey: true, readOnly: true },
  { key: "DocumentCode", label: "รหัสเอกสาร", type: "text" },
  { key: "Description", label: "รายละเอียด", type: "text" },
  { key: "IsCustomNumber", label: "กำหนดเอง", type: "checkbox" },
  { key: "UseYearMonthPrefix", label: "นำหน้าด้วยปีเดือน", type: "checkbox", hideWhen: { field: "IsCustomNumber", equals: true } },
  { key: "LatestNumber", label: "เลขที่ล่าสุด", type: "number", hideWhen: { field: "IsCustomNumber", equals: true } },
  { key: "NextNumber", label: "เลขที่ถัดไป", type: "text", readOnly: true, hideWhen: { field: "IsCustomNumber", equals: true } },
];
export default async function ReferencePage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "REFERENCE", "read");
  if (!canRead) redirect("/");

  const [canSave, canDelete, companiesRaw, banksRaw, departmentsRaw, positionsRaw, blacklistRaw, documentNumbersRaw] = await Promise.all([
    hasPermission(user, "REFERENCE", "save"),
    hasPermission(user, "REFERENCE", "delete"),
    prisma.refCompany.findMany({ orderBy: { CompanyCode: "asc" } }),
    prisma.refBank.findMany({ orderBy: { BankCode: "asc" } }),
    prisma.refDepartment.findMany({ orderBy: { DeptCode: "asc" } }),
    prisma.refPosition.findMany({ orderBy: { PositionCode: "asc" } }),
    prisma.refBlackList.findMany({ orderBy: { AddedDate: "desc" } }),
    prisma.refDocumentNumber.findMany({ orderBy: { DocumentCode: "asc" } }),
  ]);

  // Prisma.Decimal fields (PositionAllowance) aren't plain objects React
  // Server Components can pass to a Client Component — round-trip through
  // JSON so Decimal.toJSON() turns them into strings.
  const [companies, banks, departments, positions, blacklist, documentNumbers] = JSON.parse(
    JSON.stringify([companiesRaw, banksRaw, departmentsRaw, positionsRaw, blacklistRaw, documentNumbersRaw.map(withNextNumber)]),
  );

  return (
    <div className="w-full px-6 py-8">
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
                allowExport
                allowImport
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
                allowExport
                allowImport
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
            label: "เลขที่เอกสาร",
            content: (
              <ReferenceTable
                key="/api/reference/document-numbers"
                apiBase="/api/reference/document-numbers"
                fields={documentNumberFields}
                canSave={canSave}
                canDelete={canDelete}
                initialRows={documentNumbers}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
