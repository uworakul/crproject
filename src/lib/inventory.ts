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
