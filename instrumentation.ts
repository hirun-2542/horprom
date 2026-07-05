// Runs once at server start (Next.js instrumentation hook) — creates tables if missing.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureSchema } = await import("./lib/db");
    await ensureSchema();
  }
}
