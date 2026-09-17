import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import ReferenceTable, { type FieldDef } from "../../reference/reference-table";

const siteFields: FieldDef[] = [
  { key: "SiteCode", label: "รหัสหน่วยงาน", type: "text", isKey: true },
  { key: "SiteName", label: "ชื่อหน่วยงาน", type: "text" },
];

export default async function SitesPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "SITE", "read");
  if (!canRead) redirect("/");

  const [canSave, canDelete, sitesRaw] = await Promise.all([
    hasPermission(user, "SITE", "save"),
    hasPermission(user, "SITE", "delete"),
    prisma.mstSite.findMany({ orderBy: { SiteCode: "asc" } }),
  ]);

  const sites = JSON.parse(JSON.stringify(sitesRaw));

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">หน่วยงาน (Site)</h1>
      <ReferenceTable apiBase="/api/sites" fields={siteFields} hasIsActive canSave={canSave} canDelete={canDelete} initialRows={sites} />
    </div>
  );
}
