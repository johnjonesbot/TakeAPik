/**
 * Runs once when the server instance boots, before it serves requests —
 * regardless of how the process is launched (the hosting platform starts the
 * standalone server directly, so npm lifecycle hooks never fire there).
 * Applying migrations here keeps schema and code deploying as one unit; the
 * migrate script is idempotent and advisory-locked, so concurrent instances
 * are safe.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { migrate } = await import("../scripts/migrate");
    await migrate();
  }
}
