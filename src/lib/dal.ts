import "server-only";
import { cache } from "react";
import { verifySessionRecord } from "./session";
import { runWithTenantClient } from "./tenant-context";

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
  const result = await verifySessionRecord();
  if (!result) return null;

  // Re-enter the tenant context HERE, in this function's own frame,
  // immediately after awaiting verifySessionRecord() — its internal DB
  // queries leave AsyncLocalStorage in a state that doesn't survive back
  // out to code that runs after it returns (a confirmed limitation of the
  // mssql driver adapter, not a generic AsyncLocalStorage issue — see
  // verifySessionRecord()'s doc comment). Re-establishing it one hop up
  // like this is enough: everything downstream (every other Route
  // Handler/Server Component/src/lib/*.ts helper) only ever CONSUMES this
  // ambient context, never re-enters it, so they're unaffected.
  runWithTenantClient(result.tenantClient);

  const { record } = result;
  return {
    userId: record.User.UserID,
    role: record.User.Role,
    displayName: record.User.DisplayName,
    defaultSiteCode: record.User.DefaultSiteCode,
  };
});
