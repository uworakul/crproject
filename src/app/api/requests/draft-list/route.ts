import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { hasPermission, requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";
import { REQUEST_TYPE_VALUES, REQUEST_TYPE_DOCTYPE } from "@/lib/request";

// BR-019: "Draft List" is really the approver's pending-approval queue —
// every SUBMITTED request across all 3 types the user has read access to,
// not actually limited to DRAFT-status rows despite the name.
export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const denied = await requirePermission(user, "DRAFT_LIST", "read");
  if (denied) return denied;

  const visibleTypes = (
    await Promise.all(REQUEST_TYPE_VALUES.map(async (t) => ((await hasPermission(user, REQUEST_TYPE_DOCTYPE[t], "read")) ? t : null)))
  ).filter((t): t is (typeof REQUEST_TYPE_VALUES)[number] => t !== null);

  if (visibleTypes.length === 0) return apiSuccess([]);

  const rows = await prisma.trnRequest.findMany({
    where: { Status: "SUBMITTED", RequestType: { in: visibleTypes } },
    include: { Employee: { select: { FullName: true } } },
    orderBy: { SubmittedDate: "asc" },
  });
  return apiSuccess(rows);
}
