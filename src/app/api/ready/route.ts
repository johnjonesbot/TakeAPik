import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Readiness: proves the database answers. No dependency details or secrets. */
export async function GET() {
  try {
    await getPool().query("SELECT 1");
    return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "not-ready" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
