// Applies pending Prisma migrations to every tenant database listed in
// tenants.json. Every tenant runs the same prisma/schema.prisma, so a
// schema change has to be deployed to all of them, not just the one
// DATABASE_URL used for local `prisma` CLI work (dev/introspection).
//
// Usage: npx tsx scripts/migrate-all-tenants.ts
import "dotenv/config";
import { readFileSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";

interface TenantConfig {
  code: string;
  name: string;
  databaseUrl: string;
}

const filePath = path.join(process.cwd(), "tenants.json");
const tenants: TenantConfig[] = JSON.parse(readFileSync(filePath, "utf-8"));

if (tenants.length === 0) {
  console.log("tenants.json is empty — nothing to migrate.");
  process.exit(0);
}

let failed = false;

for (const tenant of tenants) {
  console.log(`\n=== ${tenant.code} (${tenant.name}) ===`);
  // Args are fixed/trusted (not derived from tenant data), but Node still
  // warns about combining shell:true with an args array — pass one string
  // instead, which is also what actually needs the shell on Windows (npx
  // resolves to npx.cmd there).
  const result = spawnSync("npx prisma migrate deploy", {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DATABASE_URL: tenant.databaseUrl },
  });
  if (result.status !== 0) {
    console.error(`Migration FAILED for tenant ${tenant.code}`);
    failed = true;
  }
}

if (failed) {
  console.error("\nOne or more tenants failed to migrate — check the log above.");
  process.exit(1);
}

console.log(`\nAll ${tenants.length} tenant(s) migrated successfully.`);
