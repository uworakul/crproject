import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import Tabs from "../reference/tabs";
import RequestTypeView from "./request-type-view";
import { REQUEST_TYPE_VALUES, REQUEST_TYPE_DOCTYPE, type RequestType } from "@/lib/request";

const TYPE_LABELS: Record<RequestType, string> = { ADVANCE: "เบิกล่วงหน้า", LOAN: "เงินกู้", TRAINING: "ค่าอบรม" };

export default async function RequestsPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const visibility = await Promise.all(
    REQUEST_TYPE_VALUES.map(async (t) => ({
      type: t,
      canRead: await hasPermission(user, REQUEST_TYPE_DOCTYPE[t], "read"),
      canSave: await hasPermission(user, REQUEST_TYPE_DOCTYPE[t], "save"),
    })),
  );

  const visibleTypes = visibility.filter((v) => v.canRead);
  if (visibleTypes.length === 0) redirect("/");

  const rowsByType = await Promise.all(
    visibleTypes.map((v) =>
      prisma.trnRequest.findMany({
        where: { RequestType: v.type },
        include: { Employee: { select: { FullName: true } } },
        orderBy: { CreatedDate: "desc" },
      }),
    ),
  );
  const safeRows = JSON.parse(JSON.stringify(rowsByType));

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">การขออนุมัติ</h1>
      <Tabs
        tabs={visibleTypes.map((v, i) => ({
          label: TYPE_LABELS[v.type],
          content: <RequestTypeView key={v.type} type={v.type} initialRows={safeRows[i]} canSave={v.canSave} />,
        }))}
      />
    </div>
  );
}
