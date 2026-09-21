// Node-only half of instrumentation.ts, split out and dynamically imported
// so Turbopack never has to bundle process.emit (unsupported in the Edge
// Runtime) into the edge build at all — see instrumentation.ts for why this
// exists.
export function silenceIpSniDeprecationWarning() {
  const originalEmit = process.emit.bind(process);
  process.emit = ((event: string, warning?: unknown, ...rest: unknown[]) => {
    if (event === "warning" && warning && typeof warning === "object" && "code" in warning && (warning as { code?: unknown }).code === "DEP0123") {
      return false;
    }
    return originalEmit(event, warning as never, ...(rest as []));
  }) as typeof process.emit;
}
