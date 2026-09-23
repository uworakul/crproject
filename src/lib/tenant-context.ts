// Deliberately no "server-only" import — server.ts (a plain Node.js
// entrypoint run via tsx) needs to call runRequestWithTenant() directly.
import { AsyncLocalStorage } from "async_hooks";
import type { PrismaClient } from "../../generated/prisma/client";

// Stashed on globalThis, same reasoning as prisma.ts's/tenant-registry.ts's
// globalForPrisma/globalForTenants pattern — but for a DIFFERENT reason
// here: Turbopack compiles each Route Handler/Server Component as its own
// entry point, and different entry points can end up with their OWN
// separate module instance of this file (confirmed empirically — a plain
// `const tenantALS = new AsyncLocalStorage()` module singleton was NOT the
// same instance seen from src/lib/session.ts as from an API route file, so
// enterWith() calls made in one were invisible via getStore() in the
// other). A globalThis-keyed singleton guarantees every bundle/chunk in
// the process shares the exact same AsyncLocalStorage instance.
const globalForTenantContext = globalThis as unknown as {
  tenantALS: AsyncLocalStorage<PrismaClient> | undefined;
};
const tenantALS = globalForTenantContext.tenantALS ?? new AsyncLocalStorage<PrismaClient>();
globalForTenantContext.tenantALS = tenantALS;

/** Called once per request (from verifySessionRecord() or the login route) after resolving the tenant's PrismaClient. */
export function runWithTenantClient(client: PrismaClient) {
  tenantALS.enterWith(client);
}

/**
 * The per-request entry point, called from server.ts around the ENTIRE
 * Next.js request handling — required for reasons beyond just the
 * globalThis fix above: plain `next dev`/`next start` (no custom server)
 * was confirmed empirically to still lose context between
 * verifySessionRecord() setting it and a Route Handler's own later
 * `prisma` calls seeing it, even with the globalThis singleton in place.
 * Wrapping the whole request in tenantALS.run() here, before Next's own
 * internal dispatch/rendering machinery ever runs, reliably fixes that —
 * see server.ts's own comment. Both fixes are needed together; removing
 * either one (verified by testing without each) reintroduces the failure.
 *
 * client is null for requests with no resolvable tenant yet (no session
 * cookie, e.g. the login page/route) — those resolve their own tenant
 * directly instead (the login route calls runWithTenantClient() itself).
 */
export function runRequestWithTenant<T>(client: PrismaClient | null, callback: () => T): T {
  if (!client) return callback();
  return tenantALS.run(client, callback);
}

/**
 * Read by prisma.ts's Proxy on every property access. Throws instead of
 * silently falling back to any particular database — a request that reaches
 * this without a tenant resolved first is a bug, not something to paper over.
 */
export function getCurrentTenantClient(): PrismaClient {
  const client = tenantALS.getStore();
  if (!client) {
    throw new Error(
      "No tenant context set for this request — every request must resolve a tenant (via verifySessionRecord() or the login route) before touching `prisma`.",
    );
  }
  return client;
}

/**
 * For the rare spot (root layout's generateMetadata) that runs for every
 * route including pre-login ones, where there may legitimately be no tenant
 * yet — returns null instead of throwing so callers can fall back to a
 * static default rather than crash.
 */
export function getCurrentTenantClientOrNull(): PrismaClient | null {
  return tenantALS.getStore() ?? null;
}
