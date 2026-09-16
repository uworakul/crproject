import { verifySession } from "@/lib/dal";
import { deleteSession } from "@/lib/session";
import { logAction } from "@/lib/audit-log";
import { apiSuccess } from "@/lib/api-response";

export async function POST() {
  const user = await verifySession();
  if (user) {
    await logAction(user.userId, "LOGOUT", { targetTable: "sys_user", targetId: user.userId });
  }

  await deleteSession();

  return apiSuccess({ ok: true });
}
