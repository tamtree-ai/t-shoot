/**
 * Copies a finished run's validated output onto Tamshoot's document: narration → the
 * scene (asset, duration, phrase timings, voice no longer out of date); clip → the take;
 * stick-produce → a new version.
 * Called by the worker after `driveRun`; safe to call twice (it only overwrites with the
 * same output).
 */
import "server-only";

import { and, eq, max } from "drizzle-orm";

import { db, schema } from "@/db";
import { ClipOut, NarrateOut, RenderOut, StickProduceIn, StickProduceOut } from "@/lib/tamtree/stage-flows";
import { timelineDigest } from "@/lib/timeline";
import { aiClips } from "@/types/ai-clips";
import { stickSkit, type StickVersionPayload } from "@/types/stick-skit";
import { produceDigest } from "./skit";

export async function applyRunResult(runId: string): Promise<void> {
  const [run] = await db.select().from(schema.runs).where(eq(schema.runs.id, runId));
  if (!run || run.status !== "completed" || !run.output) return;

  if (run.flow === aiClips.flows.narrate && run.sceneId) {
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
  } else if (run.flow === aiClips.flows.clip && run.takeId) {
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
  } else if (run.flow === aiClips.flows.render) {
    const out = RenderOut.parse(run.output);
    // Runs carry no version id; the timeline they were asked to render identifies it.
    const digest = timelineDigest((run.input as { timeline: unknown }).timeline);
    await db
      .update(schema.projectVersions)
      .set({ renderAssetId: out.asset_id, costUsd: run.costUsd })
      .where(and(eq(schema.projectVersions.projectId, run.projectId), eq(schema.projectVersions.digest, digest)));
  } else if (run.flow === stickSkit.flows.produce) {
    await recordStickVersion(run.projectId, StickProduceIn.parse(run.input), StickProduceOut.parse(run.output), run.costUsd);
  }
}

/**
 * A made skit becomes a version (09 §3): the skit as approved, its voices and catalog, and the
 * render's four files. Keyed by the produce digest, so a replayed result never mints a second.
 */
async function recordStickVersion(projectId: string, input: StickProduceIn, out: StickProduceOut, costUsd: string | null) {
  const digest = produceDigest(input);
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: schema.projectVersions.id })
      .from(schema.projectVersions)
      .where(and(eq(schema.projectVersions.projectId, projectId), eq(schema.projectVersions.digest, digest)))
      .limit(1);
    if (!existing) {
      const [{ n }] = await tx.select({ n: max(schema.projectVersions.number) }).from(schema.projectVersions).where(eq(schema.projectVersions.projectId, projectId));
      const payload: StickVersionPayload = {
        skit: input.skit,
        voices: input.voices,
        catalog_version: input.catalog_version,
        render: { mp4: out.mp4_asset_id, srt: out.srt_asset_id, txt: out.txt_asset_id, manifest: out.manifest_asset_id },
        duration_s: out.duration_s,
        mp4_digest: out.digest,
        ...(out.reminder ? { reminder: out.reminder } : {}),
      };
      await tx.insert(schema.projectVersions).values({
        projectId,
        kind: stickSkit.kind,
        number: (n ?? 0) + 1,
        payload,
        digest,
        renderAssetId: out.mp4_asset_id,
        costUsd,
      });
    }
    await tx.update(schema.projects).set({ step: "review", updatedAt: new Date() }).where(eq(schema.projects.id, projectId));
  });
}
