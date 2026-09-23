import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { resolveTenant } from "./tenant-registry";
import { runWithTenantClient } from "./tenant-context";
import {
  SESSION_COOKIE_NAME,
  encryptSessionCookie,
  decryptSessionCookie,
  sessionCookieMaxAgeMs,
} from "./session-cookie";

/**
 * Creates a DB-backed session row (sys_session) and sets the encrypted
 * session-id cookie. Follows the Next.js-recommended "Database Sessions"
 * pattern: the cookie only carries an encrypted opaque session id, never
 * user data, so a revoke in the DB takes effect immediately.
 */
export async function createSession(
  userId: string,
  tenantCode: string,
  meta?: { ipAddress?: string; userAgent?: string },
) {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + sessionCookieMaxAgeMs());

  await prisma.sysSession.create({
    data: {
      SessionID: sessionId,
      UserID: userId,
      ExpiresDate: expiresAt,
      IPAddress: meta?.ipAddress,
      UserAgent: meta?.userAgent,
    },
  });

  const token = await encryptSessionCookie({ sessionId, userId, tenantCode });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}

/** Optimistic (cookie-only, no DB hit) read — for use in proxy.ts only. */
export async function readOptimisticSession() {
  const cookieStore = await cookies();
  return decryptSessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

/**
 * Secure session check — verifies the cookie AND that the sys_session row
 * still exists, isn't revoked, and isn't expired. This is what Route
 * Handlers / Server Components must call before trusting a session.
 *
 * Returns both the session record AND the tenant's PrismaClient. dal.ts's
 * verifySession() re-enters the returned tenantClient itself via
 * runWithTenantClient() right after awaiting this, as cheap defense in
 * depth — tenant-context.ts's tenantALS is a globalThis singleton
 * specifically so that isn't strictly required anymore (Turbopack compiles
 * each Route Handler/Server Component as its own bundle; before that fix,
 * different bundles could end up with their OWN separate module instance
 * of tenant-context.ts, so an enterWith() call made from inside this
 * function was invisible from a different route's bundle — confirmed
 * empirically). Keeping the re-entry in dal.ts costs nothing and guards
 * against the same class of bug resurfacing some other way.
 */
export async function verifySessionRecord() {
  const cookiePayload = await readOptimisticSession();
  if (!cookiePayload) return null;

  const tenant = resolveTenant(cookiePayload.tenantCode);
  if (!tenant) return null;
  runWithTenantClient(tenant.client);

  const record = await prisma.sysSession.findUnique({
    where: { SessionID: cookiePayload.sessionId },
    include: { User: true },
  });

  if (
    !record ||
    record.IsRevoked ||
    record.ExpiresDate < new Date() ||
    !record.User.IsActive
  ) {
    return null;
  }

  await prisma.sysSession.update({
    where: { SessionID: record.SessionID },
    data: { LastActivityDate: new Date() },
  });

  return { record, tenantClient: tenant.client };
}

/** Revokes the current session in the DB (audit trail kept) and clears the cookie. */
export async function deleteSession() {
  const cookiePayload = await readOptimisticSession();
  if (cookiePayload) {
    await prisma.sysSession
      .update({
        where: { SessionID: cookiePayload.sessionId },
        data: { IsRevoked: true },
      })
      .catch(() => {
        // Session row may already be gone; deleting the cookie below is what matters.
      });
  }
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
