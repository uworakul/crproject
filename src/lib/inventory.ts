import "server-only";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "./prisma";

export const MOVEMENT_TYPE_VALUES = ["ADJUST", "PURCHASE", "TRANSFER", "ISSUE", "RETURN"] as const;
export type MovementType = (typeof MOVEMENT_TYPE_VALUES)[number];

export const MOVEMENT_TYPE_DOCTYPE: Record<MovementType, string> = {
  ADJUST: "STOCK_COUNT",
  PURCHASE: "STOCK_PURCHASE",
  TRANSFER: "STOCK_TRANSFER",
  ISSUE: "STOCK_ISSUE",
  RETURN: "STOCK_RETURN",
};

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  ADJUST: "ตรวจนับสต๊อก",
  PURCHASE: "ซื้อสินค้า",
  TRANSFER: "โอนสินค้าระหว่างคลัง",
  ISSUE: "จำหน่ายสินค้า/เครื่องแบบ",
  RETURN: "คืนสินค้า",
};

// Stock level is derived from the CONFIRMED movement ledger, never stored —
// matches the approved "inv_stock_movement is a central ledger" design.
// Direction per MovementType: PURCHASE/ADJUST/RETURN add to WarehouseCode,
// ISSUE subtracts from WarehouseCode, TRANSFER subtracts from WarehouseCode
// and adds to TargetWarehouseCode. ADJUST allows negative Qty (count correction).
export async function getStockBalance(warehouseCode: string, productCode: string): Promise<Prisma.Decimal> {
  const details = await prisma.invStockMovementDetail.findMany({
    where: { ProductCode: productCode, Movement: { Status: "CONFIRMED", OR: [{ WarehouseCode: warehouseCode }, { TargetWarehouseCode: warehouseCode }] } },
    include: { Movement: { select: { MovementType: true, WarehouseCode: true, TargetWarehouseCode: true } } },
  });

  let balance = new Prisma.Decimal(0);
  for (const d of details) {
    const type = d.Movement.MovementType as MovementType;
    if (type === "PURCHASE" || type === "ADJUST" || type === "RETURN") {
      if (d.Movement.WarehouseCode === warehouseCode) balance = balance.add(d.Qty);
    } else if (type === "ISSUE") {
      if (d.Movement.WarehouseCode === warehouseCode) balance = balance.sub(d.Qty);
    } else if (type === "TRANSFER") {
      if (d.Movement.WarehouseCode === warehouseCode) balance = balance.sub(d.Qty);
      if (d.Movement.TargetWarehouseCode === warehouseCode) balance = balance.add(d.Qty);
    }
  }
  return balance;
}

// Movement types that draw stock OUT of WarehouseCode and therefore need a
// sufficiency check before confirming (a negative ADJUST is a count
// correction reducing recorded stock, so it needs the same check).
export function isOutboundLine(type: MovementType, qty: Prisma.Decimal): boolean {
  if (type === "ISSUE" || type === "TRANSFER") return true;
  if (type === "ADJUST") return qty.isNegative();
  return false;
}

export function decimalOf(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export function sumAmounts(details: { Amount: Prisma.Decimal }[]): Prisma.Decimal {
  return details.reduce((sum, d) => sum.add(d.Amount), new Prisma.Decimal(0));
}

export function minDecimal(a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal {
  return Prisma.Decimal.min(a, b);
}

export function toMovementDetailData(entries: { productCode: string; qty: number; unitPrice: number }[]) {
  return entries.map((e) => {
    const qty = new Prisma.Decimal(e.qty);
    const unitPrice = new Prisma.Decimal(e.unitPrice);
    return { ProductCode: e.productCode, Qty: qty, UnitPrice: unitPrice, Amount: qty.mul(unitPrice) };
  });
}

// Which header fields a MovementType requires/forbids — CHECK constraints in
// the DDL don't express this (they only constrain MovementType's value set),
// so the app enforces it here.
export function validateMovementFields(
  type: MovementType,
  fields: { warehouseCode: string; targetWarehouseCode: string | null; supplierCode: string | null; empCode: string | null },
): string | null {
  if (type === "PURCHASE") {
    if (!fields.supplierCode) return "supplierCode is required for PURCHASE";
    if (fields.targetWarehouseCode) return "targetWarehouseCode is not used for PURCHASE";
    if (fields.empCode) return "empCode is not used for PURCHASE";
  } else if (type === "TRANSFER") {
    if (!fields.targetWarehouseCode) return "targetWarehouseCode is required for TRANSFER";
    if (fields.targetWarehouseCode === fields.warehouseCode) return "targetWarehouseCode must differ from warehouseCode";
    if (fields.supplierCode) return "supplierCode is not used for TRANSFER";
    if (fields.empCode) return "empCode is not used for TRANSFER";
  } else if (type === "ISSUE" || type === "RETURN") {
    if (!fields.empCode) return `empCode is required for ${type}`;
    if (fields.supplierCode) return `supplierCode is not used for ${type}`;
    if (fields.targetWarehouseCode) return `targetWarehouseCode is not used for ${type}`;
  } else if (type === "ADJUST") {
    if (fields.supplierCode) return "supplierCode is not used for ADJUST";
    if (fields.targetWarehouseCode) return "targetWarehouseCode is not used for ADJUST";
    if (fields.empCode) return "empCode is not used for ADJUST";
  }
  return null;
}

export async function getStockBalancesForWarehouse(warehouseCode: string): Promise<Map<string, Prisma.Decimal>> {
  const details = await prisma.invStockMovementDetail.findMany({
    where: { Movement: { Status: "CONFIRMED", OR: [{ WarehouseCode: warehouseCode }, { TargetWarehouseCode: warehouseCode }] } },
    include: { Movement: { select: { MovementType: true, WarehouseCode: true, TargetWarehouseCode: true } } },
  });

  const balances = new Map<string, Prisma.Decimal>();
  const add = (code: string, amount: Prisma.Decimal) => balances.set(code, (balances.get(code) ?? new Prisma.Decimal(0)).add(amount));

  for (const d of details) {
    const type = d.Movement.MovementType as MovementType;
    if (type === "PURCHASE" || type === "ADJUST" || type === "RETURN") {
      if (d.Movement.WarehouseCode === warehouseCode) add(d.ProductCode, d.Qty);
    } else if (type === "ISSUE") {
      if (d.Movement.WarehouseCode === warehouseCode) add(d.ProductCode, d.Qty.neg());
    } else if (type === "TRANSFER") {
      if (d.Movement.WarehouseCode === warehouseCode) add(d.ProductCode, d.Qty.neg());
      if (d.Movement.TargetWarehouseCode === warehouseCode) add(d.ProductCode, d.Qty);
    }
  }
  return balances;
}

// "ตรวจสอบการเคลื่อนไหว" Stock Card (2026-09-29) — one line per CONFIRMED
// movement-detail row that touched this (productCode, warehouseCode) pair,
// signed relative to that one warehouse the exact same way
// getStockBalance()/getStockBalancesForWarehouse() above do (PURCHASE/
// ADJUST/RETURN add, ISSUE subtracts, TRANSFER adds or subtracts depending
// on which side of it this warehouse was on) — qty/amount here are always
// reported as positive MAGNITUDES with an explicit direction, since a stock
// card's job is showing "how much moved which way," not a signed delta.
// ADJUST can itself carry a negative Qty (a downward count correction) —
// that still nets out correctly through the same add-the-signed-value path
// before direction/magnitude are derived from the result.
export interface StockCardEntry {
  movementId: number;
  movementDate: Date;
  movementType: MovementType;
  direction: "IN" | "OUT";
  qty: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  amount: Prisma.Decimal;
  counterWarehouseCode: string | null; // TRANSFER only — the "other side"
}

export async function getStockCardEntries(productCode: string, warehouseCode: string, upToDate: Date): Promise<StockCardEntry[]> {
  const details = await prisma.invStockMovementDetail.findMany({
    where: {
      ProductCode: productCode,
      Movement: { Status: "CONFIRMED", MovementDate: { lte: upToDate }, OR: [{ WarehouseCode: warehouseCode }, { TargetWarehouseCode: warehouseCode }] },
    },
    include: { Movement: { select: { MovementID: true, MovementType: true, WarehouseCode: true, TargetWarehouseCode: true, MovementDate: true } } },
    orderBy: [{ Movement: { MovementDate: "asc" } }, { DetailID: "asc" }],
  });

  const entries: StockCardEntry[] = [];
  const push = (d: (typeof details)[number], signedQty: Prisma.Decimal, signedAmount: Prisma.Decimal, counterWarehouseCode: string | null) => {
    entries.push({
      movementId: d.Movement.MovementID,
      movementDate: d.Movement.MovementDate,
      movementType: d.Movement.MovementType as MovementType,
      direction: signedQty.isNegative() ? "OUT" : "IN",
      qty: signedQty.abs(),
      unitPrice: d.UnitPrice,
      amount: signedAmount.abs(),
      counterWarehouseCode,
    });
  };

  for (const d of details) {
    const type = d.Movement.MovementType as MovementType;
    if (type === "PURCHASE" || type === "ADJUST" || type === "RETURN") {
      if (d.Movement.WarehouseCode === warehouseCode) push(d, d.Qty, d.Amount, null);
    } else if (type === "ISSUE") {
      if (d.Movement.WarehouseCode === warehouseCode) push(d, d.Qty.neg(), d.Amount.neg(), null);
    } else if (type === "TRANSFER") {
      if (d.Movement.WarehouseCode === warehouseCode) push(d, d.Qty.neg(), d.Amount.neg(), d.Movement.TargetWarehouseCode);
      if (d.Movement.TargetWarehouseCode === warehouseCode) push(d, d.Qty, d.Amount, d.Movement.WarehouseCode);
    }
  }
  return entries;
}

// Company-wide on-hand qty for one product, across every warehouse combined
// — used for the weighted-average UnitCost recalculation on Purchase
// approval (inv_product.UnitCost isn't warehouse-scoped, so the cost basis
// has to weight against total stock, not any single warehouse's balance).
// TRANSFER lines are skipped entirely: a transfer subtracts from its source
// warehouse and adds the same qty to its target, netting to zero company-wide.
export async function getTotalStockBalance(productCode: string): Promise<Prisma.Decimal> {
  const details = await prisma.invStockMovementDetail.findMany({
    where: { ProductCode: productCode, Movement: { Status: "CONFIRMED" } },
    include: { Movement: { select: { MovementType: true } } },
  });

  let balance = new Prisma.Decimal(0);
  for (const d of details) {
    const type = d.Movement.MovementType as MovementType;
    if (type === "PURCHASE" || type === "ADJUST" || type === "RETURN") balance = balance.add(d.Qty);
    else if (type === "ISSUE") balance = balance.sub(d.Qty);
  }
  return balance;
}
