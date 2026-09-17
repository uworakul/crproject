import { NextResponse } from "next/server";

/**
 * Standard API error shape per FSD §6 (Worksheet API design):
 * { "error": "UPPER_SNAKE_CODE", "message": "...", ...context }
 */
export function apiError(
  status: number,
  code: string,
  message?: string,
  context?: Record<string, unknown>,
) {
  return NextResponse.json({ error: code, message, ...context }, { status });
}

// BigInt fields (e.g. mst_employee_history.HistoryID, sys_process_log.LogID)
// aren't valid JSON — NextResponse.json() throws on them directly, so
// stringify them first via a replacer, same as the Server Component ->
// Client Component boundary has to.
export function apiSuccess<T>(data: T, status = 200) {
  const safe = JSON.parse(JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value)));
  return NextResponse.json(safe, { status });
}
