import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function POST(_req: Request, ctx: RouteContext<"/api/inventory/stock-counts/[id]/submit">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_COUNT", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const stockCountId = Number(id);
  if (!Number.isInteger(stockCountId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invStockCountHeader.findUnique({ where: { StockCountHeaderID: stockCountId }, include: { Details: true } });
  if (!existing) return apiError(404, "STOCK_COUNT_NOT_FOUND");

  if (existing.Status !== "DRAFT") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a DRAFT stock count can be submitted", { currentStatus: existing.Status });
  }
  if (existing.Details.length === 0) {
    return apiError(422, "NO_DETAIL_ROWS", "Add at least one product line before submitting");
  }

  const updated = await prisma.invStockCountHeader.update({
    where: { StockCountHeaderID: stockCountId },
    data: { Status: "SUBMITTED", SubmittedDate: new Date(), UpdatedBy: user.userId, UpdatedDate: new Date() },
  });

  await logAction(user.userId, "SUBMIT_STOCK_COUNT", { targetTable: "inv_stock_count_header", targetId: id });
  return apiSuccess(updated);
}
