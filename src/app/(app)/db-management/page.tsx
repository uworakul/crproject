import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { DB_CATALOG, allCatalogTables, canManageDatabase, getConditionFields } from "@/lib/db-management";
import DbManagementView from "./db-management-view";

export default async function DbManagementPage() {
  const user = await verifySession();
  if (!user) redirect("/login");
  if (!canManageDatabase(user)) redirect("/");

  const conditionFields = await getConditionFields(allCatalogTables());
  return (
    <div className="w-full px-6 py-8">
      <h1 className="text-xl font-semibold text-gray-900">Database Management</h1>
      <p className="mt-1 text-sm text-red-600">ลบข้อมูลถาวร กู้คืนไม่ได้ — ตารางที่ผูกกันอยู่ (เช่น รายการลูกของเอกสาร) จะถูกลบตามอัตโนมัติ</p>
      <DbManagementView groups={DB_CATALOG} conditionFields={conditionFields} />
    </div>
  );
}
