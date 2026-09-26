/**
 * The cost ledger (S3.3): what a project has spent, what is still on the way, and what
 * the next run of a stage is likely to cost. Money stays a decimal string; sums are done
 * in SQL `numeric`, never by adding floats.
 */
import "server-only";

import { and, desc, eq, gt, inArray, notInArray, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { CLIP_PRICE_USD, NARRATE_PRICE_USD, SCRIPT_PRICE_USD } from "@/lib/estimate";
import type { StageFlow } from "@/lib/tamtree/stage-flows";

const TERMINAL = ["completed", "failed", "cancelled"];
const HISTORY = 10;

export async function projectSpend(projectId: string): Promise<{ spentUsd: string; inflightUsd: string }> {
  const [row] = await db
    .select({
      spent: sql<string>`coalesce(sum(${schema.runs.costUsd}) filter (where ${inArray(schema.runs.status, TERMINAL)}), 0)::text`,
      inflight: sql<string>`coalesce(sum(${schema.runs.estimateUsd}) filter (where ${notInArray(schema.runs.status, TERMINAL)}), 0)::text`,
    })
    .from(schema.runs)
    .where(eq(schema.runs.projectId, projectId));
  return { spentUsd: row.spent, inflightUsd: row.inflight };
}

const FALLBACK_USD: Record<StageFlow, number> = {
  "studio-script": SCRIPT_PRICE_USD,
  "studio-narrate": NARRATE_PRICE_USD,
  "studio-clip": CLIP_PRICE_USD,
  "studio-render": 0,
};

/**
 * Price of one run of `stage`: the mean of the last N real, charged costs, else the
 * template's declared maximum (02 §4). Reused runs cost 0 and would drag the mean down,
 * so only runs that actually charged something count.
 */
export async function estimateStageUsd(stage: StageFlow): Promise<string> {
  const rows = await db
    .select({ cost: schema.runs.costUsd })
    .from(schema.runs)
    .where(and(eq(schema.runs.flow, stage), eq(schema.runs.status, "completed"), gt(schema.runs.costUsd, "0")))
    .orderBy(desc(schema.runs.createdAt))
    .limit(HISTORY);
  if (rows.length === 0) return FALLBACK_USD[stage].toFixed(6);
  const micros = rows.reduce((sum, r) => sum + Math.round(Number(r.cost) * 1e6), 0);
  return (micros / rows.length / 1e6).toFixed(6);
}
