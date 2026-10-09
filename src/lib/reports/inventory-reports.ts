import "server-only";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getStockBalancesForWarehouse, getStockCardEntries, MOVEMENT_TYPE_LABELS, type MovementType } from "@/lib/inventory";
import { employeeWhere, type ReportFilters } from "./types";

// Stock reports (2026-09-30) — the 5 that read the stock ledger/documents
// (the 6th, หนี้ค้างค่าชุด, reuses the debt-report engine; see
// debt-reports.ts). Every report here returns the same generic table shape
// so one route can render PDF and Excel for all of them.
export interface InvReportColumn {
  key: string;
  header: string;
  width: number;
  numeric?: boolean;
}
export interface InvReportTable {
  title: string;
  columns: InvReportColumn[];
  rows: Record<string, string | number>[];
  totalRow?: Record<string, string | number>;
  filterSummary: string;
}

export interface InvReportFilters extends ReportFilters {
  warehouseCode?: string;
  categoryCode?: string;
  productCode?: string;
  startDate?: Date;
  endDate?: Date;
}

const D = (v: number | string) => new Prisma.Decimal(v);
const fmt = (v: Prisma.Decimal) => v.toFixed(2);
const dateStr = (d: Date) => d.toISOString().slice(0, 10);

function productWhere(f: InvReportFilters) {
  return {
    ...(f.productCode ? { ProductCode: f.productCode } : {}),
    ...(f.categoryCode ? { CategoryCode: f.categoryCode } : {}),
  };
}

async function filterSummaryOf(f: InvReportFilters): Promise<string> {
  const parts: string[] = [];
  if (f.warehouseCode) {
    const w = await prisma.invWarehouse.findUnique({ where: { WarehouseCode: f.warehouseCode } });
    parts.push(`คลัง ${f.warehouseCode}${w ? ` ${w.WarehouseName}` : ""}`);
  }
  if (f.categoryCode) parts.push(`หมวด ${f.categoryCode}`);
  if (f.productCode) parts.push(`สินค้า ${f.productCode}`);
  if (f.startDate && f.endDate) parts.push(`วันที่ ${dateStr(f.startDate)} ถึง ${dateStr(f.endDate)}`);
  if (f.empCode) parts.push(`พนักงาน ${f.empCode}`);
  return parts.join(" | ");
}

// 1. สต๊อกคงเหลือ — current on-hand per (warehouse, product): ledger qty +
// the separately-tracked second-hand qty, valued at the product's UnitCost.
export async function getStockBalanceReport(f: InvReportFilters): Promise<InvReportTable> {
  const [warehouses, products, secondhand] = await Promise.all([
    prisma.invWarehouse.findMany({ where: { IsActive: true, ...(f.warehouseCode ? { WarehouseCode: f.warehouseCode } : {}) }, orderBy: { WarehouseCode: "asc" } }),
    prisma.invProduct.findMany({ where: productWhere(f), include: { ProductCategory: true }, orderBy: { ProductCode: "asc" } }),
    prisma.invSecondhandStock.findMany({ where: f.warehouseCode ? { WarehouseCode: f.warehouseCode } : {} }),
  ]);
  const secondhandByKey = new Map(secondhand.map((s) => [`${s.WarehouseCode}::${s.ProductCode}`, s.Qty]));

  const rows: Record<string, string | number>[] = [];
  let totalValue = D(0);
  for (const w of warehouses) {
    const balances = await getStockBalancesForWarehouse(w.WarehouseCode);
    for (const p of products) {
      const qty = balances.get(p.ProductCode) ?? D(0);
      const sh = secondhandByKey.get(`${w.WarehouseCode}::${p.ProductCode}`) ?? D(0);
      if (qty.isZero() && sh.isZero()) continue;
      const value = qty.mul(p.UnitCost);
      totalValue = totalValue.add(value);
      rows.push({
        warehouse: `${w.WarehouseCode} ${w.WarehouseName}`,
        category: p.ProductCategory?.CategoryName ?? "-",
        productCode: p.ProductCode,
        productName: p.ProductName,
        unit: p.UnitOfMeasure ?? "-",
        qty: fmt(qty),
        secondhandQty: fmt(sh),
        unitCost: fmt(p.UnitCost),
        value: fmt(value),
      });
    }
  }
  return {
    title: "รายงานสต๊อกคงเหลือ",
    filterSummary: await filterSummaryOf(f),
    columns: [
      { key: "warehouse", header: "คลัง", width: 2.4 },
      { key: "category", header: "หมวด", width: 1.6 },
      { key: "productCode", header: "รหัสสินค้า", width: 1.4 },
      { key: "productName", header: "ชื่อสินค้า", width: 3 },
      { key: "unit", header: "หน่วย", width: 0.9 },
      { key: "qty", header: "จำนวน", width: 1.2, numeric: true },
      { key: "secondhandQty", header: "มือสอง", width: 1.2, numeric: true },
      { key: "unitCost", header: "ต้นทุน/หน่วย", width: 1.4, numeric: true },
      { key: "value", header: "มูลค่า", width: 1.6, numeric: true },
    ],
    rows,
    totalRow: { warehouse: "รวม", value: fmt(totalValue) },
  };
}

// 2. Stock card — same ledger + same valuation basis as the on-screen
// "ตรวจสอบการเคลื่อนไหว" tab (product's current UnitCost applied uniformly,
// see src/app/api/inventory/stock-card/route.ts for why).
export async function getStockCardReport(f: InvReportFilters): Promise<InvReportTable> {
  const { warehouseCode, productCode, startDate, endDate } = f;
  if (!warehouseCode || !productCode || !startDate || !endDate) throw new Error("STOCK_CARD_PARAMS");
  const [warehouse, product] = await Promise.all([
    prisma.invWarehouse.findUnique({ where: { WarehouseCode: warehouseCode } }),
    prisma.invProduct.findUnique({ where: { ProductCode: productCode } }),
  ]);
  if (!warehouse) throw new Error("WAREHOUSE_NOT_FOUND");
  if (!product) throw new Error("PRODUCT_NOT_FOUND");

  const entries = await getStockCardEntries(productCode, warehouseCode, endDate);
  const counterCodes = [...new Set(entries.map((e) => e.counterWarehouseCode).filter((c): c is string => c !== null))];
  const counters = counterCodes.length ? await prisma.invWarehouse.findMany({ where: { WarehouseCode: { in: counterCodes } } }) : [];
  const counterName = new Map(counters.map((w) => [w.WarehouseCode, w.WarehouseName]));

  let openingQty = D(0);
  let runningQty = D(0);
  const rows: Record<string, string | number>[] = [];
  let totalIn = D(0);
  let totalOut = D(0);
  for (const e of entries) {
    const signed = e.direction === "IN" ? e.qty : e.qty.neg();
    if (e.movementDate < startDate) {
      openingQty = openingQty.add(signed);
      runningQty = runningQty.add(signed);
      continue;
    }
    runningQty = runningQty.add(signed);
    if (e.direction === "IN") totalIn = totalIn.add(e.qty);
    else totalOut = totalOut.add(e.qty);
    rows.push({
      date: dateStr(e.movementDate),
      type: MOVEMENT_TYPE_LABELS[e.movementType as MovementType],
      counter: e.counterWarehouseCode ? `${e.counterWarehouseCode} ${counterName.get(e.counterWarehouseCode) ?? ""}`.trim() : "-",
      qtyIn: e.direction === "IN" ? fmt(e.qty) : "",
      qtyOut: e.direction === "OUT" ? fmt(e.qty) : "",
      balanceQty: fmt(runningQty),
      balanceValue: fmt(runningQty.mul(product.UnitCost)),
    });
  }
  rows.unshift({ date: dateStr(startDate), type: "ยอดยกมา", counter: "-", qtyIn: "", qtyOut: "", balanceQty: fmt(openingQty), balanceValue: fmt(openingQty.mul(product.UnitCost)) });

  return {
    title: `Stock Card — ${productCode} ${product.ProductName}`,
    filterSummary: `คลัง ${warehouseCode} ${warehouse.WarehouseName} | วันที่ ${dateStr(startDate)} ถึง ${dateStr(endDate)} | มูลค่าคิดที่ต้นทุน ${fmt(product.UnitCost)} บาท/หน่วย`,
    columns: [
      { key: "date", header: "วันที่", width: 1.4 },
      { key: "type", header: "รายการ", width: 2.4 },
      { key: "counter", header: "คลังคู่โอน", width: 2.4 },
      { key: "qtyIn", header: "รับเข้า", width: 1.3, numeric: true },
      { key: "qtyOut", header: "จ่ายออก", width: 1.3, numeric: true },
      { key: "balanceQty", header: "คงเหลือ", width: 1.4, numeric: true },
      { key: "balanceValue", header: "มูลค่าคงเหลือ", width: 1.6, numeric: true },
    ],
    rows,
    totalRow: { type: "รวมในช่วงวันที่", qtyIn: fmt(totalIn), qtyOut: fmt(totalOut), balanceQty: fmt(runningQty), balanceValue: fmt(runningQty.mul(product.UnitCost)) },
  };
}

// 3. สินค้าสวัสดิการ — approved Issue lines flagged IsWelfare (given free to
// an employee). Valued at the product's UnitCost since the line's own price
// is always 0 for welfare.
export async function getWelfareReport(f: InvReportFilters): Promise<InvReportTable> {
  const details = await prisma.invIssueDetail.findMany({
    where: {
      IsWelfare: true,
      Product: productWhere(f),
      Header: {
        Status: "APPROVED",
        ...(f.warehouseCode ? { WarehouseCode: f.warehouseCode } : {}),
        ...(f.startDate && f.endDate ? { DeliveryDate: { gte: f.startDate, lte: f.endDate } } : {}),
        Employee: employeeWhere(f),
      },
    },
    include: { Header: { include: { Employee: { select: { FullName: true } }, Warehouse: true } }, Product: true },
    orderBy: [{ Header: { DeliveryDate: "asc" } }, { IssueDetailID: "asc" }],
  });
  let totalQty = D(0);
  let totalValue = D(0);
  const rows = details.map((d) => {
    const value = d.Qty.mul(d.Product.UnitCost);
    totalQty = totalQty.add(d.Qty);
    totalValue = totalValue.add(value);
    return {
      date: dateStr(d.Header.DeliveryDate),
      documentNo: d.Header.DocumentNo ?? "-",
      employee: `${d.Header.EmpCode} ${d.Header.Employee.FullName}`,
      warehouse: d.Header.Warehouse ? `${d.Header.WarehouseCode} ${d.Header.Warehouse.WarehouseName}` : "(รอเลือกคลัง)",
      product: `${d.ProductCode} ${d.Product.ProductName}${d.IsSecondHand ? " (มือสอง)" : ""}`,
      qty: fmt(d.Qty),
      value: fmt(value),
    };
  });
  return {
    title: "รายงานสินค้าสวัสดิการ",
    filterSummary: await filterSummaryOf(f),
    columns: [
      { key: "date", header: "วันที่", width: 1.3 },
      { key: "documentNo", header: "เลขที่เอกสาร", width: 1.4 },
      { key: "employee", header: "พนักงาน", width: 3 },
      { key: "warehouse", header: "คลัง", width: 2.2 },
      { key: "product", header: "สินค้า", width: 3.2 },
      { key: "qty", header: "จำนวน", width: 1.1, numeric: true },
      { key: "value", header: "มูลค่า (ต้นทุน)", width: 1.5, numeric: true },
    ],
    rows,
    totalRow: { employee: "รวม", qty: fmt(totalQty), value: fmt(totalValue) },
  };
}

// 4. สรุปการขาย-รับคืน — per product (normal and second-hand kept apart):
// approved Issue lines that are NOT welfare (real sales) against approved
// Return lines, netted.
export async function getSaleReturnSummaryReport(f: InvReportFilters): Promise<InvReportTable> {
  const headerBase = {
    Status: "APPROVED",
    ...(f.warehouseCode ? { WarehouseCode: f.warehouseCode } : {}),
    ...(f.startDate && f.endDate ? { DeliveryDate: { gte: f.startDate, lte: f.endDate } } : {}),
    Employee: employeeWhere(f),
  };
  const [issues, returns] = await Promise.all([
    prisma.invIssueDetail.findMany({ where: { IsWelfare: false, Product: productWhere(f), Header: headerBase }, include: { Product: true } }),
    prisma.invReturnDetail.findMany({ where: { Product: productWhere(f), Header: headerBase }, include: { Product: true } }),
  ]);

  interface Acc {
    productCode: string;
    productName: string;
    secondhand: boolean;
    soldQty: Prisma.Decimal;
    soldAmount: Prisma.Decimal;
    returnQty: Prisma.Decimal;
    returnAmount: Prisma.Decimal;
  }
  const byKey = new Map<string, Acc>();
  const get = (code: string, name: string, secondhand: boolean) => {
    const key = `${code}::${secondhand}`;
    let acc = byKey.get(key);
    if (!acc) {
      acc = { productCode: code, productName: name, secondhand, soldQty: D(0), soldAmount: D(0), returnQty: D(0), returnAmount: D(0) };
      byKey.set(key, acc);
    }
    return acc;
  };
  for (const d of issues) {
    const a = get(d.ProductCode, d.Product.ProductName, d.IsSecondHand);
    a.soldQty = a.soldQty.add(d.Qty);
    a.soldAmount = a.soldAmount.add(d.Amount);
  }
  for (const d of returns) {
    const a = get(d.ProductCode, d.Product.ProductName, d.IsSecondHand);
    a.returnQty = a.returnQty.add(d.Qty);
    a.returnAmount = a.returnAmount.add(d.Amount);
  }

  const accs = [...byKey.values()].sort((a, b) => a.productCode.localeCompare(b.productCode) || Number(a.secondhand) - Number(b.secondhand));
  const total = { soldQty: D(0), soldAmount: D(0), returnQty: D(0), returnAmount: D(0) };
  const rows = accs.map((a) => {
    total.soldQty = total.soldQty.add(a.soldQty);
    total.soldAmount = total.soldAmount.add(a.soldAmount);
    total.returnQty = total.returnQty.add(a.returnQty);
    total.returnAmount = total.returnAmount.add(a.returnAmount);
    return {
      product: `${a.productCode} ${a.productName}`,
      kind: a.secondhand ? "มือสอง" : "ปกติ",
      soldQty: fmt(a.soldQty),
      soldAmount: fmt(a.soldAmount),
      returnQty: fmt(a.returnQty),
      returnAmount: fmt(a.returnAmount),
      netQty: fmt(a.soldQty.sub(a.returnQty)),
      netAmount: fmt(a.soldAmount.sub(a.returnAmount)),
    };
  });
  return {
    title: "รายงานสรุปการขาย-รับคืน",
    filterSummary: await filterSummaryOf(f),
    columns: [
      { key: "product", header: "สินค้า", width: 3.6 },
      { key: "kind", header: "ชนิด", width: 1 },
      { key: "soldQty", header: "ขาย (จำนวน)", width: 1.3, numeric: true },
      { key: "soldAmount", header: "ขาย (บาท)", width: 1.5, numeric: true },
      { key: "returnQty", header: "รับคืน (จำนวน)", width: 1.4, numeric: true },
      { key: "returnAmount", header: "รับคืน (บาท)", width: 1.5, numeric: true },
      { key: "netQty", header: "สุทธิ (จำนวน)", width: 1.3, numeric: true },
      { key: "netAmount", header: "สุทธิ (บาท)", width: 1.5, numeric: true },
    ],
    rows,
    totalRow: {
      product: "รวม",
      soldQty: fmt(total.soldQty),
      soldAmount: fmt(total.soldAmount),
      returnQty: fmt(total.returnQty),
      returnAmount: fmt(total.returnAmount),
      netQty: fmt(total.soldQty.sub(total.returnQty)),
      netAmount: fmt(total.soldAmount.sub(total.returnAmount)),
    },
  };
}

// 5. สรุปความเคลื่อนไหว — per (warehouse, product): opening balance, then
// each kind of movement inside the date range, then closing. Built from ONE
// query over the confirmed ledger up to endDate (no per-product round trips).
export async function getMovementSummaryReport(f: InvReportFilters): Promise<InvReportTable> {
  const { startDate, endDate } = f;
  if (!startDate || !endDate) throw new Error("MOVEMENT_SUMMARY_PARAMS");
  const details = await prisma.invStockMovementDetail.findMany({
    where: {
      Product: productWhere(f),
      Movement: {
        Status: "CONFIRMED",
        MovementDate: { lte: endDate },
        ...(f.warehouseCode ? { OR: [{ WarehouseCode: f.warehouseCode }, { TargetWarehouseCode: f.warehouseCode }] } : {}),
      },
    },
    include: { Movement: { select: { MovementType: true, WarehouseCode: true, TargetWarehouseCode: true, MovementDate: true } }, Product: { select: { ProductName: true } } },
  });

  type Kind = "purchase" | "returned" | "transferIn" | "adjust" | "issue" | "transferOut";
  interface Acc {
    warehouseCode: string;
    productCode: string;
    productName: string;
    opening: Prisma.Decimal;
    kinds: Record<Kind, Prisma.Decimal>;
  }
  const byKey = new Map<string, Acc>();
  const add = (wh: string, d: (typeof details)[number], signed: Prisma.Decimal, kind: Kind) => {
    if (f.warehouseCode && wh !== f.warehouseCode) return;
    const key = `${wh}::${d.ProductCode}`;
    let acc = byKey.get(key);
    if (!acc) {
      acc = { warehouseCode: wh, productCode: d.ProductCode, productName: d.Product.ProductName, opening: D(0), kinds: { purchase: D(0), returned: D(0), transferIn: D(0), adjust: D(0), issue: D(0), transferOut: D(0) } };
      byKey.set(key, acc);
    }
    if (d.Movement.MovementDate < startDate) acc.opening = acc.opening.add(signed);
    else acc.kinds[kind] = acc.kinds[kind].add(signed);
  };
  for (const d of details) {
    const type = d.Movement.MovementType as MovementType;
    const src = d.Movement.WarehouseCode;
    if (type === "PURCHASE") add(src, d, d.Qty, "purchase");
    else if (type === "RETURN") add(src, d, d.Qty, "returned");
    else if (type === "ADJUST") add(src, d, d.Qty, "adjust");
    else if (type === "ISSUE") add(src, d, d.Qty.neg(), "issue");
    else if (type === "TRANSFER") {
      add(src, d, d.Qty.neg(), "transferOut");
      if (d.Movement.TargetWarehouseCode) add(d.Movement.TargetWarehouseCode, d, d.Qty, "transferIn");
    }
  }

  const warehouses = await prisma.invWarehouse.findMany({ select: { WarehouseCode: true, WarehouseName: true } });
  const whName = new Map(warehouses.map((w) => [w.WarehouseCode, w.WarehouseName]));
  const accs = [...byKey.values()].sort((a, b) => a.warehouseCode.localeCompare(b.warehouseCode) || a.productCode.localeCompare(b.productCode));
  const rows: Record<string, string | number>[] = [];
  for (const a of accs) {
    const k = a.kinds;
    const closing = a.opening.add(k.purchase).add(k.returned).add(k.transferIn).add(k.adjust).add(k.issue).add(k.transferOut);
    // Skip rows with nothing at all (no opening, no movement, no closing).
    if (a.opening.isZero() && closing.isZero() && Object.values(k).every((v) => v.isZero())) continue;
    rows.push({
      warehouse: `${a.warehouseCode} ${whName.get(a.warehouseCode) ?? ""}`.trim(),
      product: `${a.productCode} ${a.productName}`,
      opening: fmt(a.opening),
      purchase: fmt(k.purchase),
      returned: fmt(k.returned),
      transferIn: fmt(k.transferIn),
      adjust: fmt(k.adjust),
      issue: fmt(k.issue.neg()),
      transferOut: fmt(k.transferOut.neg()),
      closing: fmt(closing),
    });
  }
  return {
    title: "รายงานสรุปความเคลื่อนไหวสินค้า",
    filterSummary: await filterSummaryOf(f),
    columns: [
      { key: "warehouse", header: "คลัง", width: 2 },
      { key: "product", header: "สินค้า", width: 3.2 },
      { key: "opening", header: "ยกมา", width: 1.1, numeric: true },
      { key: "purchase", header: "ซื้อ", width: 1, numeric: true },
      { key: "returned", header: "รับคืน", width: 1, numeric: true },
      { key: "transferIn", header: "โอนเข้า", width: 1, numeric: true },
      { key: "adjust", header: "ปรับปรุง (+/-)", width: 1.2, numeric: true },
      { key: "issue", header: "จำหน่าย", width: 1, numeric: true },
      { key: "transferOut", header: "โอนออก", width: 1, numeric: true },
      { key: "closing", header: "คงเหลือ", width: 1.1, numeric: true },
    ],
    rows,
  };
}
