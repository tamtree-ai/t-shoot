/**
 * Records a completed stage run against Tamshoot's own `runs` table (02-architecture
 * §4 data model) after `runStageSync` finishes it. F2's dispatcher takes over recording
 * queued/running/failed runs from events; this only ever writes a `completed` row,
 * which is all F1's synchronous script calls produce.
 */
import "server-only";

import { db, schema } from "@/db";
import type { StageFlow, StageInput } from "@/lib/tamtree/stage-flows";
import { runStageSync, type StageRunResult } from "./tamtree-run";

export async function runAndRecordStage<F extends StageFlow>(params: {
  projectId: string;
  sceneId?: string;
  flow: F;
  input: StageInput[F];
  estimateUsd: string;
  confirmedBy: string;
}): Promise<StageRunResult<F>> {
  const result = await runStageSync(params.flow, params.input);
  await db.insert(schema.runs).values({
    projectId: params.projectId,
    sceneId: params.sceneId,
    stage: params.flow,
    tamtreeRunId: result.runId,
    idempotencyKey: result.idempotencyKey,
    status: "completed",
    estimateUsd: params.estimateUsd,
    costUsd: result.costUsd.toString(),
    input: params.input,
    confirmedBy: params.confirmedBy,
  });
  return result;
}
