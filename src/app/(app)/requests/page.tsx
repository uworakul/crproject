import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import Tabs from "../reference/tabs";
import RequestGroupView from "./request-group-view";
import { REQUEST_PERMISSION_GROUPS } from "@/lib/request";

export default async function RequestsPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const visibility = await Promise.all(
    REQUEST_PERMISSION_GROUPS.map(async (g) => ({
      group: g,
      canRead: await hasPermission(user, g.docType, "read"),
      canSave: await hasPermission(user, g.docType, "save"),
    })),
  );

  const visibleGroups = visibility.filter((v) => v.canRead);
  if (visibleGroups.length === 0) redirect("/");

  const headersByGroup = await Promise.all(
    visibleGroups.map((v) =>
      prisma.trnRequestHeader.findMany({
        where: { DocumentCode: { in: v.group.documentCodes } },
        include: { Details: true },
        orderBy: { CreatedDate: "desc" },
      }),
    ),
  );
  const safeHeaders = JSON.parse(JSON.stringify(headersByGroup));

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">การขออนุมัติ</h1>
      <Tabs
        tabs={visibleGroups.map((v, i) => ({
          label: v.group.label,
          content: (
            <RequestGroupView
              key={v.group.docType}
              docType={v.group.docType}
              documentCodes={v.group.documentCodes}
              initialRows={safeHeaders[i]}
              canSave={v.canSave}
            />
          ),
        }))}
      />
    </div>
  );
}
