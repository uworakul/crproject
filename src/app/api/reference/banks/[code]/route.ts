import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/reference/banks/[code]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "save");
  if (denied) return denied;

  const { code } = await ctx.params;
  const existing = await prisma.refBank.findUnique({ where: { BankCode: code } });
  if (!existing) return apiError(404, "BANK_NOT_FOUND");

  let body: { bankNameTH?: unknown; bankNameEN?: unknown; isActive?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const updated = await prisma.refBank.update({
    where: { BankCode: code },
    data: {
      BankNameTH: typeof body.bankNameTH === "string" ? body.bankNameTH.trim() : undefined,
      BankNameEN: typeof body.bankNameEN === "string" ? body.bankNameEN.trim() : undefined,
      IsActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_BANK", { targetTable: "ref_bank", targetId: code });
  return apiSuccess(updated);
}

// Soft delete: mst_employee.BankCode has a NO ACTION FK to this table.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/reference/banks/[code]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "delete");
  if (denied) return denied;

  const { code } = await ctx.params;
  const existing = await prisma.refBank.findUnique({ where: { BankCode: code } });
  if (!existing) return apiError(404, "BANK_NOT_FOUND");

  await prisma.refBank.update({ where: { BankCode: code }, data: { IsActive: false, UpdatedBy: user.userId, UpdatedDate: new Date() } });
  await logAction(user.userId, "DEACTIVATE_BANK", { targetTable: "ref_bank", targetId: code });
  return apiSuccess({ ok: true });
}
