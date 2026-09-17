import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

// Edit support added so this behaves like the other reference-code tables
// (Bank/Department/Position) — code (IDCardNo) + name (FullName) only.
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/reference/blacklist/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const blackListId = Number(id);
  if (!Number.isInteger(blackListId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.refBlackList.findUnique({ where: { BlackListID: blackListId } });
  if (!existing) return apiError(404, "BLACKLIST_ENTRY_NOT_FOUND");

  let body: { idCardNo?: unknown; fullName?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const updated = await prisma.refBlackList.update({
    where: { BlackListID: blackListId },
    data: {
      IDCardNo: typeof body.idCardNo === "string" && body.idCardNo.trim() ? body.idCardNo.trim() : undefined,
      FullName: typeof body.fullName === "string" && body.fullName.trim() ? body.fullName.trim() : undefined,
    },
  });

  await logAction(user.userId, "UPDATE_BLACKLIST", { targetTable: "ref_black_list", targetId: id });
  return apiSuccess(updated);
}

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
