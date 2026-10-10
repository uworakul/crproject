import "server-only";
import { prisma } from "./prisma";
import type { CurrentUser } from "./dal";

// Database Management (2026-10-10): destructive bulk delete, only for the
// accounts below. Hard-coded on purpose — not a sys_user_permission row — so
// it can't be granted by accident through the normal permission screen.
const ALLOWED_USER_IDS = new Set(["admin", "wat"]);
export function canManageDatabase(user: CurrentUser) {
  return ALLOWED_USER_IDS.has(user.userId.toLowerCase());
}

export interface CatalogEntry {
  label: string; // sub-menu name shown in the sidebar
  tables: string[];
}
export interface CatalogGroup {
  label: string; // main menu (sidebar group), Configuration excluded
  entries: CatalogEntry[];
}

// Mirrors the sidebar groups. NOT deletable, deliberately: sys_user (cascade
// would reach every CreatedBy/ApprovedBy FK = the whole database + logins),
// sys_menu (menu seed), sys_config (Configuration).
export const DB_CATALOG: CatalogGroup[] = [
  {
    label: "ผู้ใช้งานและสิทธิ์",
    entries: [
      { label: "ผู้ใช้งาน (สิทธิ์/ขอบเขต)", tables: ["sys_user_permission", "sys_user_company", "sys_user_employee_type"] },
      { label: "Audit Log", tables: ["sys_process_log"] },
      { label: "Session", tables: ["sys_session"] },
    ],
  },
  {
    label: "ตั้งค่าระบบ/รหัสอ้างอิง",
    entries: [
      { label: "รหัสอ้างอิงหลัก", tables: ["ref_company", "ref_bank", "ref_department", "ref_position", "mst_position_income", "ref_black_list", "ref_document_number"] },
      { label: "ประเภทและสิทธิการลา", tables: ["mst_leave_type", "mst_leave_tenure_tier"] },
      { label: "ภาษี/ค่าลดหย่อน/กองทุนฯ", tables: ["ref_tax_bracket", "ref_deduction_rate", "ref_sso_base", "ref_welfare_fund"] },
      { label: "รายได้และรายการหัก", tables: ["ref_income_type", "ref_deduction_type"] },
      { label: "งวดการจ่าย", tables: ["sys_period"] },
    ],
  },
  {
    label: "ข้อมูลหลักพนักงาน",
    entries: [{ label: "ทะเบียนพนักงาน", tables: ["mst_employee", "mst_employee_work_experience", "mst_employee_training_experience", "mst_employee_quota", "mst_employee_history"] }],
  },
  {
    label: "การขออนุมัติ",
    entries: [{ label: "เอกสารขออนุมัติ", tables: ["trn_request_header", "trn_request_detail"] }],
  },
  {
    label: "สินค้าคงคลัง/เครื่องแบบ",
    entries: [
      { label: "ข้อมูลหลัก", tables: ["inv_supplier", "inv_warehouse", "inv_product_category", "inv_product", "inv_secondhand_stock"] },
      { label: "ตรวจนับสต๊อก", tables: ["inv_stock_count_header", "inv_stock_count_detail"] },
      { label: "ซื้อสินค้า", tables: ["inv_purchase_header", "inv_purchase_detail"] },
      { label: "โอนสินค้า", tables: ["inv_transfer_header", "inv_transfer_detail"] },
      { label: "จำหน่าย", tables: ["inv_issue_header", "inv_issue_detail"] },
      { label: "คืนสินค้า", tables: ["inv_return_header", "inv_return_detail"] },
      { label: "รายการเคลื่อนไหวสต๊อก/หนี้พนักงาน", tables: ["inv_stock_movement", "inv_stock_movement_detail", "inv_employee_debt", "inv_employee_debt_payment"] },
    ],
  },
  {
    label: "การลา",
    entries: [{ label: "บันทึกใบลา", tables: ["trn_leave_request", "mst_employee_leave_balance"] }],
  },
  {
    label: "ใบลงเวลาปฏิบัติงาน",
    entries: [
      { label: "หน่วยงาน (Site)", tables: ["mst_site", "mst_site_position", "mst_site_position_income"] },
      { label: "Worksheet", tables: ["trn_worksheet_header", "trn_worksheet_detail", "trn_worksheet_daily", "mst_attendance_code"] },
    ],
  },
  {
    label: "การประมวลผล",
    entries: [
      { label: "รายการประจำงวด", tables: ["trn_payroll_transaction", "trn_payroll_transaction_detail"] },
      { label: "คำนวณ/ปิดงวด", tables: ["trn_payroll_calculate_log", "trn_payroll_lock"] },
    ],
  },
  {
    label: "MOBILE",
    entries: [{ label: "พิกัดหน่วยงาน/รายการลงเวลา", tables: ["mst_site_location", "trn_attendance_log"] }],
  },
];

const ALL_TABLES = new Set(DB_CATALOG.flatMap((g) => g.entries.flatMap((e) => e.tables)));

const ident = (name: string) => `[${name.replace(/]/g, "]]")}]`;

export interface ConditionField {
  column: string;
  label: string;
  type: "date" | "code";
}

// Tables whose "conditional delete" offers a curated list instead of every
// date column (code = from/to range on a text key, compared as text).
const CONDITION_OVERRIDES: Record<string, ConditionField[]> = {
  mst_employee: [
    { column: "EmpCode", label: "รหัสพนักงาน", type: "code" },
    { column: "ResignDate", label: "วันลาออก", type: "date" },
  ],
};

export async function getConditionFields(tables: string[]): Promise<Record<string, ConditionField[]>> {
  const dates = await getDateColumns(tables);
  return Object.fromEntries(tables.map((t) => [t, CONDITION_OVERRIDES[t] ?? dates[t].map((c) => ({ column: c, label: c, type: "date" as const }))]));
}

async function getDateColumns(tables: string[]): Promise<Record<string, string[]>> {
  const rows = await prisma.$queryRawUnsafe<{ t: string; c: string }[]>(
    `SELECT o.name AS t, c.name AS c
       FROM sys.columns c
       JOIN sys.objects o ON o.object_id = c.object_id AND o.type = 'U'
       JOIN sys.types ty ON ty.user_type_id = c.user_type_id
      WHERE ty.name IN ('date','datetime','datetime2','smalldatetime')
      ORDER BY o.name, c.column_id`,
  );
  const out: Record<string, string[]> = Object.fromEntries(tables.map((t) => [t, []]));
  for (const r of rows) if (r.t in out) out[r.t].push(r.c);
  return out;
}

export function allCatalogTables(): string[] {
  return [...ALL_TABLES];
}

interface Fk {
  child: string;
  parent: string;
  pairs: { childCol: string; parentCol: string }[];
}
async function loadForeignKeys(): Promise<Fk[]> {
  const rows = await prisma.$queryRawUnsafe<{ fk: number; child: string; childCol: string; parent: string; parentCol: string }[]>(
    `SELECT fkc.constraint_object_id AS fk, ct.name AS child, cc.name AS childCol, pt.name AS parent, pc.name AS parentCol
       FROM sys.foreign_key_columns fkc
       JOIN sys.tables ct ON ct.object_id = fkc.parent_object_id
       JOIN sys.columns cc ON cc.object_id = fkc.parent_object_id AND cc.column_id = fkc.parent_column_id
       JOIN sys.tables pt ON pt.object_id = fkc.referenced_object_id
       JOIN sys.columns pc ON pc.object_id = fkc.referenced_object_id AND pc.column_id = fkc.referenced_column_id
      ORDER BY fkc.constraint_object_id, fkc.constraint_column_id`,
  );
  const map = new Map<number, Fk>();
  for (const r of rows) {
    const fk = map.get(r.fk) ?? { child: r.child, parent: r.parent, pairs: [] };
    fk.pairs.push({ childCol: r.childCol, parentCol: r.parentCol });
    map.set(r.fk, fk);
  }
  return [...map.values()];
}

export interface DeleteItem {
  table: string;
  mode: "ALL" | "RANGE";
  column?: string;
  type?: "date" | "code";
  from?: string; // yyyy-MM-dd (date) or inclusive code (code)
  to?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateItems(items: unknown, fields: Record<string, ConditionField[]>): { ok: true; items: DeleteItem[] } | { ok: false; message: string } {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, message: "ยังไม่ได้เลือกรายการ" };
  const out: DeleteItem[] = [];
  const seen = new Set<string>();
  for (const raw of items as Record<string, unknown>[]) {
    const table = typeof raw?.table === "string" ? raw.table : "";
    if (!ALL_TABLES.has(table)) return { ok: false, message: `ตาราง ${table} ไม่อยู่ในรายการที่ลบได้` };
    if (seen.has(table)) return { ok: false, message: `ตาราง ${table} ซ้ำ` };
    seen.add(table);
    if (raw.mode === "ALL") {
      out.push({ table, mode: "ALL" });
    } else if (raw.mode === "RANGE") {
      const column = typeof raw.column === "string" ? raw.column : "";
      const from = typeof raw.from === "string" ? raw.from : "";
      const to = typeof raw.to === "string" ? raw.to : "";
      const field = (fields[table] ?? []).find((f) => f.column === column);
      if (!field) return { ok: false, message: `${table}: field ${column} ใช้เป็นเงื่อนไขไม่ได้` };
      if (field.type === "date") {
        if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return { ok: false, message: `${table}: ช่วงวันที่ไม่ถูกต้อง` };
      } else if (!from.trim() || !to.trim() || from.length > 50 || to.length > 50 || from > to) {
        return { ok: false, message: `${table}: ช่วงรหัสไม่ถูกต้อง` };
      }
      out.push({ table, mode: "RANGE", column, from, to, type: field.type });
    } else {
      return { ok: false, message: `${table}: เงื่อนไขไม่ถูกต้อง` };
    }
  }
  return { ok: true, items: out };
}

interface Step {
  table: string;
  pred: (alias: string) => string;
}

// Children first: every row in a child table that points (directly or through
// other children) at a row about to be deleted is deleted before it.
function buildSteps(table: string, pred: (a: string) => string, fks: Fk[], path: string[], counter: { n: number }): Step[] {
  const steps: Step[] = [];
  for (const fk of fks) {
    if (fk.parent !== table || fk.child === table || path.includes(fk.child)) continue;
    const parentAlias = `p${counter.n++}`;
    const childPred = (a: string) =>
      `EXISTS (SELECT 1 FROM ${ident(table)} ${parentAlias} WHERE ${fk.pairs.map((p) => `${parentAlias}.${ident(p.parentCol)} = ${a}.${ident(p.childCol)}`).join(" AND ")} AND ${pred(parentAlias)})`;
    steps.push(...buildSteps(fk.child, childPred, fks, [...path, fk.child], counter));
  }
  steps.push({ table, pred });
  return steps;
}

const DRY_RUN_MARK = "__DRY_RUN_ROLLBACK__";

/**
 * Runs every delete in ONE transaction. dryRun = real deletes, then rollback,
 * so the per-table counts (cascade included) are exact, not estimates.
 */
export async function runDelete(items: DeleteItem[], dryRun: boolean): Promise<{ counts: Record<string, number>; error?: string }> {
  const fks = await loadForeignKeys();
  const counts: Record<string, number> = {};
  try {
    await prisma.$transaction(
      async (tx) => {
        for (const item of items) {
          const params: string[] = [];
          let pred: (a: string) => string;
          if (item.mode === "ALL") {
            pred = () => "1 = 1";
          } else {
            params.push(item.from!, item.to!);
            const col = ident(item.column!);
            pred =
              item.type === "code"
                ? (a) => `${a}.${col} >= @P1 AND ${a}.${col} <= @P2`
                : (a) => `${a}.${col} >= CAST(@P1 AS date) AND ${a}.${col} < DATEADD(day, 1, CAST(@P2 AS date))`;
          }
          const steps = buildSteps(item.table, pred, fks, [item.table], { n: 0 });
          for (const step of steps) {
            const n = await tx.$executeRawUnsafe(`DELETE t FROM ${ident(step.table)} t WHERE ${step.pred("t")}`, ...params);
            counts[step.table] = (counts[step.table] ?? 0) + n;
          }
        }
        if (dryRun) throw new Error(DRY_RUN_MARK);
      },
      { timeout: 120000, maxWait: 10000 },
    );
  } catch (e) {
    // Duck-typed on the message (not instanceof) — see CLAUDE.md, class
    // identity is unreliable across the per-route Turbopack bundles.
    const message = e instanceof Error ? e.message : String(e);
    if (!message.includes(DRY_RUN_MARK)) return { counts: {}, error: message.slice(0, 400) };
  }
  return { counts };
}
