import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

// Singleton row ("มีแต่บันทึก 1 record", user 2026-09-21) — always ID 1.
// Auto-provisions a default (all-null/false) row on first read, same
// convention as getOrCreateDocumentNumber() in src/lib/document-number.ts,
// so there's nothing an admin has to set up manually before this page works.
export async function getOrCreateSystemConfig() {
  const existing = await prisma.sysConfig.findUnique({ where: { SysConfigID: 1 } });
  if (existing) return existing;
  return prisma.sysConfig.create({ data: { SysConfigID: 1 } });
}

// ---- Registration / Access Key checking (2026-09-30) ----------------------
// "Pass Checking" may only be set when the Registration Code equals the
// actual database name AND the Access Key is one of the operator-held keys.
// The accepted keys live in the SYSTEM_ACCESS_KEYS env var (comma-separated),
// never in source — this repo is public. Unset/empty = nothing is accepted
// (fail closed). The plain key is never stored or returned: only a bcrypt
// hash is persisted in sys_config.AccessKey, and the API never sends it back.
function allowedAccessKeys(): string[] {
  return (process.env.SYSTEM_ACCESS_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

const digest = (v: string) => createHash("sha256").update(v).digest();

export function isAllowedAccessKey(plain: string): boolean {
  let ok = false;
  for (const key of allowedAccessKeys()) {
    // Compare every candidate (no early exit) with a constant-time compare of
    // fixed-length digests.
    if (timingSafeEqual(digest(plain), digest(key))) ok = true;
  }
  return ok;
}

export async function storedAccessKeyIsAllowed(hash: string | null): Promise<boolean> {
  if (!hash) return false;
  for (const key of allowedAccessKeys()) {
    if (await bcrypt.compare(key, hash).catch(() => false)) return true;
  }
  return false;
}

export function hashAccessKey(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function getDatabaseName(): Promise<string> {
  const rows = await prisma.$queryRaw<{ name: string }[]>`SELECT DB_NAME() AS name`;
  return rows[0]?.name ?? "";
}

// What the client is allowed to see: never the access key itself.
export function toClientConfig(config: Awaited<ReturnType<typeof getOrCreateSystemConfig>>) {
  const { AccessKey, ...rest } = config;
  return { ...rest, HasAccessKey: !!AccessKey };
}
