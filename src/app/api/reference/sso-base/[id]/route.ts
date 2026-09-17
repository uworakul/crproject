import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/reference/sso-base/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  const ssoBaseId = Number(id);
  if (!Number.isInteger(ssoBaseId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.refSsoBase.findUnique({ where: { SSOBaseID: ssoBaseId } });
  if (!existing) return apiError(404, "SSO_BASE_NOT_FOUND");

  await prisma.refSsoBase.delete({ where: { SSOBaseID: ssoBaseId } });
  await logAction(user.userId, "DELETE_SSO_BASE", { targetTable: "ref_sso_base", targetId: id });
  return apiSuccess({ ok: true });
}
