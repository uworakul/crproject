import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/reference/tax-brackets/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "TAX_RATE", "delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  const bracketId = Number(id);
  if (!Number.isInteger(bracketId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.refTaxBracket.findUnique({ where: { BracketID: bracketId } });
  if (!existing) return apiError(404, "TAX_BRACKET_NOT_FOUND");

  await prisma.refTaxBracket.delete({ where: { BracketID: bracketId } });
  await logAction(user.userId, "DELETE_TAX_BRACKET", { targetTable: "ref_tax_bracket", targetId: id });
  return apiSuccess({ ok: true });
}
