import "server-only";
import { cache } from "react";
import { verifySessionRecord } from "./session";

export interface CurrentUser {
  userId: string;
  role: string;
  displayName: string;
  defaultSiteCode: string | null;
}

/**
 * Central auth-check point. Every Route Handler, Server Component, and
 * Server Action that needs to know who's asking should call this — never
 * read the cookie directly. Memoized per-request with React's cache() so
 * multiple calls during one render/request only hit the DB once.
 */
export const verifySession = cache(async (): Promise<CurrentUser | null> => {
  const record = await verifySessionRecord();
  if (!record) return null;

  return {
    userId: record.User.UserID,
    role: record.User.Role,
    displayName: record.User.DisplayName,
    defaultSiteCode: record.User.DefaultSiteCode,
  };
});
