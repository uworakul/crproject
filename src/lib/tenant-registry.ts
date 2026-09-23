// Deliberately no "server-only" import — server.ts (a plain Node.js
// entrypoint run via tsx, never bundled by Next's webpack/Turbopack) needs
// to call resolveTenant() directly, and "server-only" throws unconditionally
// unless its special bundler substitution is active. Safe either way: this
// module already only works on the server (fs, DB adapters).
import { readFileSync } from "fs";
import path from "path";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "../../generated/prisma/client";

interface TenantConfig {
  code: string;
  name: string;
  databaseUrl: string;
}

interface ResolvedTenant {
  code: string;
  name: string;
  client: PrismaClient;
}

// Same "reuse across dev hot-reloads" pattern src/lib/prisma.ts used to use
// for its single global client — now one cache entry per tenant instead of
// a single client.
const globalForTenants = globalThis as unknown as {
  tenantConfigs: Map<string, TenantConfig> | undefined;
  tenantClients: Map<string, PrismaClient> | undefined;
};

function loadTenantConfigs(): Map<string, TenantConfig> {
  if (globalForTenants.tenantConfigs) return globalForTenants.tenantConfigs;

  const filePath = path.join(process.cwd(), "tenants.json");
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    throw new Error(
      `tenants.json not found at ${filePath} — copy tenants.example.json to tenants.json and fill in real databaseUrl values.`,
    );
  }

  const list = JSON.parse(raw) as TenantConfig[];
  const map = new Map<string, TenantConfig>();
  for (const t of list) {
    if (!t.code || !t.databaseUrl) {
      throw new Error(`tenants.json has an entry missing code/databaseUrl: ${JSON.stringify(t)}`);
    }
    if (map.has(t.code)) {
      throw new Error(`tenants.json has a duplicate tenant code: ${t.code}`);
    }
    map.set(t.code, t);
  }

  globalForTenants.tenantConfigs = map;
  return map;
}

function getClientsCache(): Map<string, PrismaClient> {
  if (!globalForTenants.tenantClients) {
    globalForTenants.tenantClients = new Map();
  }
  return globalForTenants.tenantClients;
}

/**
 * Resolves a tenant code to its name + a cached PrismaClient connected to
 * that tenant's own database. Returns null if the code isn't in
 * tenants.json — callers treat that the same as "invalid session"/"invalid
 * login", never as a reason to fall back to some default database.
 */
export function resolveTenant(code: string): ResolvedTenant | null {
  const configs = loadTenantConfigs();
  const config = configs.get(code);
  if (!config) return null;

  const clients = getClientsCache();
  let client = clients.get(code);
  if (!client) {
    const adapter = new PrismaMssql(config.databaseUrl);
    client = new PrismaClient({ adapter });
    clients.set(code, client);
  }

  return { code: config.code, name: config.name, client };
}
