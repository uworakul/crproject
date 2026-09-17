import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/reference/blacklist/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  const blackListId = Number(id);
  if (!Number.isInteger(blackListId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.refBlackList.findUnique({ where: { BlackListID: blackListId } });
  if (!existing) return apiError(404, "BLACKLIST_ENTRY_NOT_FOUND");

  await prisma.refBlackList.delete({ where: { BlackListID: blackListId } });
  await logAction(user.userId, "DELETE_BLACKLIST", { targetTable: "ref_black_list", targetId: id });
  return apiSuccess({ ok: true });
}
