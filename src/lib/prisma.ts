import type { PrismaClient } from "../../generated/prisma/client";
import { getCurrentTenantClient } from "./tenant-context";

// `prisma` used to be a single global PrismaClient. It's now a Proxy that
// forwards every property access to the current request's tenant-specific
// PrismaClient (set by verifySessionRecord()/the login route via
// tenant-context.ts's AsyncLocalStorage) — this keeps all 200+ existing
// `import { prisma } from "@/lib/prisma"` call sites working unchanged
// while resolving to a different database per tenant per request.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getCurrentTenantClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
