// Custom server — required for multi-tenant DB routing.
//
// The tenant's PrismaClient has to be established in an AsyncLocalStorage
// context BEFORE Next.js starts dispatching the request, not inside
// verifySessionRecord() as originally attempted: React's cache() (which
// wraps verifySession()) internally uses its own AsyncLocalStorage.run(),
// and run() restores the FULL async context snapshot — across every ALS
// instance, not just its own — once its callback settles. That silently
// discards an enterWith() call made deeper in the chain the moment
// verifySession() returns. Setting it here, at the outermost frame of the
// whole request, makes it part of what nested run()s restore back TO, so it
// survives through the rest of the request. See src/lib/tenant-context.ts.
//
// See node_modules/next/dist/docs/01-app/02-guides/custom-server.md.
import "dotenv/config";
import { createServer } from "http";
import next from "next";
import { resolveTenant } from "./src/lib/tenant-registry";
import { runRequestWithTenant } from "./src/lib/tenant-context";
import { resolveTenantCodeFromCookieHeader } from "./src/lib/session-cookie";

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const tenantCode = await resolveTenantCodeFromCookieHeader(req.headers.cookie);
      const tenant = tenantCode ? resolveTenant(tenantCode) : null;
      await runRequestWithTenant(tenant?.client ?? null, () => handle(req, res));
    } catch (err) {
      console.error("Request handling error:", err);
      if (!res.headersSent) {
        res.statusCode = 500;
      }
      res.end("Internal Server Error");
    }
  });

  // Turbopack/webpack dev HMR runs over a WebSocket upgrade — without this,
  // `next dev` through the custom server would lose live-reload.
  server.on("upgrade", app.getUpgradeHandler());

  server.listen(port, () => {
    console.log(`> Server listening at http://localhost:${port} as ${dev ? "development" : process.env.NODE_ENV}`);
  });
});
