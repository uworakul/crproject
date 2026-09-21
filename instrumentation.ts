// Silences one specific, harmless Node.js runtime warning that was showing
// up as a full-screen blocking "Console Error" in the Next.js dev overlay
// (reported 2026-09-21, e.g. on /leave) even though it never affected any
// request — the app worked correctly underneath it. Root cause: DATABASE_URL
// connects to the SQL Server by raw IP (27.254.173.32), and Node's TLS layer
// deprecates using an IP address as the SNI hostname (DEP0123) every time the
// mssql/tedious driver opens a connection. There's no code-level fix on our
// side short of switching the DB host to a real hostname, which isn't ours to
// change — so this filters only DEP0123 and leaves every other warning
// (including other deprecations) untouched.
//
// register() runs under both the Node.js and Edge runtimes (e.g. for
// proxy.ts). The actual filter uses process.emit, which the Edge Runtime
// doesn't support — that logic lives in instrumentation-node.ts and is only
// ever dynamically imported here, so Turbopack never has to include it in
// the edge bundle at all.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { silenceIpSniDeprecationWarning } = await import("./instrumentation-node");
    silenceIpSniDeprecationWarning();
  }
}
