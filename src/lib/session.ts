import "server-only";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { prisma } from "./prisma";

const SESSION_COOKIE_NAME = "session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches Next.js docs' recommended example

const secretKey = process.env.SESSION_SECRET;
if (!secretKey) {
  throw new Error("SESSION_SECRET is not set — check .env (see .env.example)");
}
const encodedKey = new TextEncoder().encode(secretKey);

interface SessionCookiePayload extends JWTPayload {
  sessionId: string;
  userId: string;
}

async function encrypt(payload: SessionCookiePayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + SESSION_DURATION_MS) / 1000))
    .sign(encodedKey);
}

async function decrypt(token: string | undefined) {
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

/**
 * Creates a DB-backed session row (sys_session) and sets the encrypted
 * session-id cookie. Follows the Next.js-recommended "Database Sessions"
 * pattern: the cookie only carries an encrypted opaque session id, never
 * user data, so a revoke in the DB takes effect immediately.
 */
export async function createSession(
  userId: string,
  meta?: { ipAddress?: string; userAgent?: string },
) {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.sysSession.create({
    data: {
      SessionID: sessionId,
      UserID: userId,
      ExpiresDate: expiresAt,
      IPAddress: meta?.ipAddress,
      UserAgent: meta?.userAgent,
    },
  });

  const token = await encrypt({ sessionId, userId });
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
  return decrypt(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

/**
 * Secure session check — verifies the cookie AND that the sys_session row
 * still exists, isn't revoked, and isn't expired. This is what Route
 * Handlers / Server Components must call before trusting a session.
 */
export async function verifySessionRecord() {
  const cookiePayload = await readOptimisticSession();
  if (!cookiePayload) return null;

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

  return record;
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
