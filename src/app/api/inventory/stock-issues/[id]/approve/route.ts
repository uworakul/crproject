import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getStockBalance } from "@/lib/inventory";

// Approve = mark APPROVED + post the issue, all in one DB transaction.
// Regular lines (welfare or not — they still physically leave the
// warehouse) post as one ISSUE inv_stock_movement; secondhand lines
// decrement inv_secondhand_stock directly. Only non-welfare lines count
// toward the amount owed — that net-of-cash amount merges into the
// employee's single running OPEN "UNIFORM" debt (per the user's explicit
// choice), or is skipped entirely if cash received covers it in full
// (same "only create/touch a debt when something's actually owed"
// convention the original ISSUE-movement-confirm flow already used).
export async function POST(_req: Request, ctx: RouteContext<"/api/inventory/stock-issues/[id]/approve">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "STOCK_ISSUE", "approve");
  if (denied) return denied;

  const { id } = await ctx.params;
  const issueId = Number(id);
  if (!Number.isInteger(issueId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.invIssueHeader.findUnique({
    where: { IssueHeaderID: issueId },
    include: { Details: true },
  });
  if (!existing) return apiError(404, "STOCK_ISSUE_NOT_FOUND");

  if (existing.Status !== "SUBMITTED") {
    return apiError(409, "INVALID_STATUS_TRANSITION", "Only a SUBMITTED issue can be approved", { currentStatus: existing.Status });
  }
  if (existing.Details.length === 0) {
    return apiError(422, "NO_DETAIL_ROWS", "This issue has no product lines to approve");
  }

  const regularLines = existing.Details.filter((d) => !d.IsSecondHand);
  const secondHandLines = existing.Details.filter((d) => d.IsSecondHand);

  // Sufficiency checks up front, aggregated per product (a product could in
  // theory appear on more than one regular line, even though the add-line
  // endpoint already blocks exact duplicates of the same kind).
  const regularQtyByProduct = new Map<string, number>();
  for (const line of regularLines) {
    regularQtyByProduct.set(line.ProductCode, (regularQtyByProduct.get(line.ProductCode) ?? 0) + Number(line.Qty));
  }
  for (const [productCode, qty] of regularQtyByProduct) {
    const balance = await getStockBalance(existing.WarehouseCode, productCode);
    if (balance.lt(qty)) {
      return apiError(422, "INSUFFICIENT_STOCK", undefined, { productCode, warehouseCode: existing.WarehouseCode, available: balance.toString(), requested: qty });
    }
  }
  for (const line of secondHandLines) {
    const secondhand = await prisma.invSecondhandStock.findUnique({
      where: { WarehouseCode_ProductCode: { WarehouseCode: existing.WarehouseCode, ProductCode: line.ProductCode } },
    });
    const available = secondhand?.Qty ?? line.Qty.sub(line.Qty);
    if (available.lt(line.Qty)) {
      return apiError(422, "INSUFFICIENT_SECONDHAND_STOCK", undefined, {
        productCode: line.ProductCode,
        warehouseCode: existing.WarehouseCode,
        available: available.toString(),
        requested: line.Qty.toString(),
      });
    }
  }

  const totalAmount = existing.Details.filter((d) => !d.IsWelfare).reduce((sum, d) => sum + Number(d.Amount), 0);
  const remainingAfterCash = Math.max(0, totalAmount - Number(existing.CashReceived));

  const updated = await prisma.$transaction(async (tx) => {
    const header = await tx.invIssueHeader.update({
      where: { IssueHeaderID: issueId },
      data: { Status: "APPROVED", ApprovedBy: user.userId, ApprovedDate: new Date(), UpdatedBy: user.userId, UpdatedDate: new Date() },
    });

    if (regularLines.length > 0) {
      await tx.invStockMovement.create({
        data: {
          MovementType: "ISSUE",
          WarehouseCode: existing.WarehouseCode,
          EmpCode: existing.EmpCode,
          MovementDate: existing.DeliveryDate,
          Status: "CONFIRMED",
          CreatedBy: user.userId,
          UpdatedBy: user.userId,
          UpdatedDate: new Date(),
          Details: { create: regularLines.map((d) => ({ ProductCode: d.ProductCode, Qty: d.Qty, UnitPrice: d.UnitPrice, Amount: d.Amount })) },
        },
      });
    }

    for (const line of secondHandLines) {
      const row = await tx.invSecondhandStock.findUnique({
        where: { WarehouseCode_ProductCode: { WarehouseCode: existing.WarehouseCode, ProductCode: line.ProductCode } },
      });
      await tx.invSecondhandStock.update({
        where: { SecondhandStockID: row!.SecondhandStockID },
        data: { Qty: row!.Qty.sub(line.Qty), UpdatedBy: user.userId, UpdatedDate: new Date() },
      });
    }

    if (remainingAfterCash > 0) {
      const deductionType = await tx.refDeductionType.upsert({
        where: { DeductionCode: "UNIFORM" },
        update: {},
        create: { DeductionCode: "UNIFORM", DeductionName: "UNIFORM", IsInstallment: true, CreatedBy: user.userId },
      });

      const openDebt = await tx.invEmployeeDebt.findFirst({
        where: { EmpCode: existing.EmpCode, DeductionCode: deductionType.DeductionCode, Status: "OPEN" },
      });

      if (openDebt) {
        const newTotal = openDebt.TotalAmount.add(totalAmount);
        const newPaid = openDebt.PaidAmount.add(existing.CashReceived);
        await tx.invEmployeeDebt.update({
          where: { DebtID: openDebt.DebtID },
          data: {
            TotalAmount: newTotal,
            PaidAmount: newPaid,
            RemainingAmount: newTotal.sub(newPaid),
            DeductPerPeriod: existing.DeductPerPeriod ?? openDebt.DeductPerPeriod,
            UpdatedBy: user.userId,
            UpdatedDate: new Date(),
          },
        });
      } else {
        await tx.invEmployeeDebt.create({
          data: {
            EmpCode: existing.EmpCode,
            DeductionCode: deductionType.DeductionCode,
            Description: `จำหน่ายสินค้า/เครื่องแบบ${existing.DocumentNo ? ` #${existing.DocumentNo}` : ""}`,
            TotalAmount: totalAmount,
            PaidAmount: existing.CashReceived,
            RemainingAmount: remainingAfterCash,
            DeductPerPeriod: existing.DeductPerPeriod,
            Status: "OPEN",
            CreatedBy: user.userId,
          },
        });
      }
    }

    return header;
  });

  await logAction(user.userId, "APPROVE_STOCK_ISSUE", { targetTable: "inv_issue_header", targetId: id });
  return apiSuccess(updated);
}
