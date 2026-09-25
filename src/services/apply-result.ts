/**
 * Copies a finished run's validated output onto Tamshoot's document: narration → the
 * scene (asset, duration, phrase timings, voice no longer out of date); clip → the take.
 * Called by the worker after `driveRun`; safe to call twice (it only overwrites with the
 * same output).
 */
import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { ClipOut, NarrateOut } from "@/lib/tamtree/stage-flows";

export async function applyRunResult(runId: string): Promise<void> {
  const [run] = await db.select().from(schema.runs).where(eq(schema.runs.id, runId));
  if (!run || run.status !== "completed" || !run.output) return;

  if (run.stage === "studio-narrate" && run.sceneId) {
    const out = NarrateOut.parse(run.output);
    await db
      .update(schema.scenes)
      .set({
        narrationAssetId: out.asset_id,
        narrationDurationS: out.duration_s,
        phrases: out.phrases,
        voiceOutOfDate: false,
        updatedAt: new Date(),
      })
      .where(eq(schema.scenes.id, run.sceneId));
  } else if (run.stage === "studio-clip" && run.takeId) {
    const out = ClipOut.parse(run.output);
    await db
      .update(schema.takes)
      .set({ clipAssetId: out.asset_id, durationS: out.duration_s })
      .where(eq(schema.takes.id, run.takeId));
    if (run.sceneId) {
      await db
        .update(schema.scenes)
        .set({ chosenTakeId: run.takeId, updatedAt: new Date() })
        .where(eq(schema.scenes.id, run.sceneId));
    }
  }
}
