// Deliberately no "server-only" import — server.ts (a plain Node.js
// entrypoint run via tsx, never bundled by Next's webpack/Turbopack) needs
// to call resolveTenantCodeFromCookieHeader() directly, and the
// "server-only" package throws unconditionally unless its special bundler
// substitution is active. session.ts (which IS Next-bundled and does carry
// the guard) re-uses the encrypt/decrypt here rather than duplicating them.
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const SESSION_COOKIE_NAME = "session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches Next.js docs' recommended example

const secretKey = process.env.SESSION_SECRET;
if (!secretKey) {
  throw new Error("SESSION_SECRET is not set — check .env (see .env.example)");
}
const encodedKey = new TextEncoder().encode(secretKey);

export interface SessionCookiePayload extends JWTPayload {
  sessionId: string;
  userId: string;
  tenantCode: string;
}

export async function encryptSessionCookie(payload: SessionCookiePayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + SESSION_DURATION_MS) / 1000))
    .sign(encodedKey);
}

export async function decryptSessionCookie(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionCookiePayload>(token, encodedKey, {
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieMaxAgeMs() {
  return SESSION_DURATION_MS;
}

/**
 * Reads the tenant code straight out of a raw HTTP `Cookie` request header
 * (not Next's cookies() API — server.ts runs before Next has started
 * dispatching the request, so no cookies() context exists there yet). See
 * tenant-context.ts's runRequestWithTenant() for why resolving the tenant
 * this early, outside any Next/React internals, matters.
 */
export async function resolveTenantCodeFromCookieHeader(
  cookieHeader: string | undefined,
): Promise<string | null> {
  if (!cookieHeader) return null;
  const prefix = `${SESSION_COOKIE_NAME}=`;
  const raw = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!raw) return null;

  const token = decodeURIComponent(raw.slice(prefix.length));
  const payload = await decryptSessionCookie(token);
  return payload?.tenantCode ?? null;
}
