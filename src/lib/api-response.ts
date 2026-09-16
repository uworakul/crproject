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

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}
