import "server-only";
import { prisma } from "./prisma";

/** Writes to sys_process_log — call for every significant transaction (rule 5, CLAUDE.md). */
export async function logAction(
  userId: string,
  actionType: string,
  opts?: { targetTable?: string; targetId?: string; detail?: string; changes?: Record<string, { old: unknown; new: unknown }> },
) {
  await prisma.sysProcessLog.create({
    data: {
      UserID: userId,
      ActionType: actionType,
      TargetTable: opts?.targetTable,
      TargetID: opts?.targetId,
      Detail: opts?.detail,
      Changes: opts?.changes && Object.keys(opts.changes).length > 0 ? JSON.stringify(opts.changes) : undefined,
    },
  });
}

// Metadata columns that change on every save regardless of real content —
// excluded from the diff so it isn't just noise every time.
const DIFF_IGNORED_FIELDS = new Set(["CreatedDate", "CreatedBy", "UpdatedDate", "UpdatedBy"]);

// Prisma.Decimal/Date both implement toJSON(), so JSON.stringify already
// normalizes them the same way on both sides — this just also makes BigInt
// safe (JSON.stringify throws on raw BigInt otherwise). undefined (a missing
// key — e.g. diffing against {} for a fully deleted row) is treated as null
// rather than passed to JSON.stringify, which would return the literal
// value undefined and blow up the JSON.parse() around it.
function jsonSafe(value: unknown): unknown {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v)));
}

/**
 * Field-level old/new diff between a row fetched before an update and the
 * row returned after it — pass straight into logAction()'s `changes` opt.
 * Generic over any Prisma model's plain row object, not employee-specific,
 * so the same helper covers every module as audit logging expands to them.
 */
export function computeDiff(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { old: unknown; new: unknown }> {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (DIFF_IGNORED_FIELDS.has(key)) continue;
    const oldValue = jsonSafe(before[key]);
    const newValue = jsonSafe(after[key]);
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[key] = { old: oldValue, new: newValue };
    }
  }
  return changes;
}
