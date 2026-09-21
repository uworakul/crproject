import "server-only";
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
