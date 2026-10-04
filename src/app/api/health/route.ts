import { sql } from "drizzle-orm";

import { db } from "@/db";
import { getTamtreeConnection } from "@/lib/tamtree";

export const dynamic = "force-dynamic";

/**
 * Liveness for compose and the quickstart CI: 200 once the app can reach its database. The
 * engine's state rides along (in standalone mode, whether StickStage answers) but does not
 * fail the check: the app itself works, and the pill says what is down.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
  } catch {
    return Response.json({ ok: false, problem: "The database is not reachable." }, { status: 503 });
  }
  const engine = await getTamtreeConnection();
  return Response.json({ ok: true, engine: engine.state, ...(engine.state === "error" ? { problem: engine.problem } : {}) });
}
