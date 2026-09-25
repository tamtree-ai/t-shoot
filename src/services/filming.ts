/**
 * "Approve and start filming" (03 §1.2): one narrate run and one clip run per scene.
 * The whole batch is checked against the spend guard *first*, so a project never ends up
 * half-started because the limit trips on scene 5. Idempotency keys are derived from the
 * scene and its inputs, so pressing Approve twice collapses into the same runs.
 */
import "server-only";

import { createHash } from "node:crypto";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { fromMicros, toMicros } from "@/lib/spend-guard";
import type { ClipIn, NarrateIn } from "@/lib/tamtree/stage-flows";
import { assertFits, requestRun } from "./dispatcher";
import { estimateStageUsd } from "./ledger";

const FIRST_TAKE = 1;

export function splitPhrases(narration: string): string[] {
  const parts = narration.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean);
  return parts?.length ? parts : [narration.trim()];
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);

type ProjectRow = typeof schema.projects.$inferSelect;
type SceneRow = typeof schema.scenes.$inferSelect;

/** Seconds of footage to ask for per scene: the brief's length spread across the scenes. */
export function clipSeconds(project: ProjectRow, sceneCount: number): number {
  const brief = project.brief as { length_s?: number };
  return Math.max(2, Math.round(((brief.length_s ?? 45) / Math.max(1, sceneCount)) * 10) / 10);
}

async function attemptsFor(sceneId: string, stage: "studio-clip" | "studio-narrate"): Promise<number> {
  const rows = await db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(and(eq(schema.runs.sceneId, sceneId), eq(schema.runs.stage, stage)));
  return rows.length;
}

/** One narrate run for a scene. `attempt` is part of the key so a retry is a new run. */
export async function requestNarration(project: ProjectRow, scene: SceneRow, voice: string, memberId: string, estimateUsd: string, attemptOverride?: number) {
  const input: NarrateIn = { scene_key: scene.id, phrases: splitPhrases(scene.narration), voice };
  const attempt = attemptOverride ?? (await attemptsFor(scene.id, "studio-narrate"));
  return requestRun({
    projectId: project.id,
    sceneId: scene.id,
    stage: "studio-narrate",
    input,
    estimateUsd,
    confirmedBy: memberId,
    idempotencyKey: `${scene.id}:narrate:${hash(JSON.stringify(input))}:${attempt}`,
  });
}

/** One clip run for a take. A retry of the *same* take re-sends the same inputs (07 §2). */
export async function requestClip(
  project: ProjectRow,
  scene: SceneRow,
  take: { id: string; number: number; visualPrompt: string },
  seconds: number,
  memberId: string,
  estimateUsd: string,
  attemptOverride?: number,
) {
  const input: ClipIn = { scene_key: scene.id, visual_prompt: take.visualPrompt, seconds, take: take.number };
  const attempt = attemptOverride ?? (await attemptsFor(scene.id, "studio-clip"));
  return requestRun({
    projectId: project.id,
    sceneId: scene.id,
    takeId: take.id,
    stage: "studio-clip",
    input,
    estimateUsd,
    confirmedBy: memberId,
    idempotencyKey: `${scene.id}:clip:${take.number}:${hash(JSON.stringify(input))}:${attempt}`,
  });
}

export async function startFilming(projectId: string, memberId: string): Promise<{ runs: number }> {
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!project) throw new Error(`Project ${projectId} not found.`);
  const scenes = await db
    .select()
    .from(schema.scenes)
    .where(and(eq(schema.scenes.projectId, projectId), isNull(schema.scenes.droppedAt)))
    .orderBy(asc(schema.scenes.position));

  const [clipUsd, narrateUsd] = await Promise.all([estimateStageUsd("studio-clip"), estimateStageUsd("studio-narrate")]);
  await assertFits(projectId, fromMicros(scenes.length * (toMicros(clipUsd) + toMicros(narrateUsd))));

  const seconds = clipSeconds(project, scenes.length);
  let runs = 0;
  for (const scene of scenes) {
    const [take] = await db
      .insert(schema.takes)
      .values({ sceneId: scene.id, number: FIRST_TAKE, visualPrompt: scene.visualPrompt })
      .onConflictDoNothing({ target: [schema.takes.sceneId, schema.takes.number] })
      .returning();
    const takeRow =
      take ??
      (await db.query.takes.findFirst({
        where: and(eq(schema.takes.sceneId, scene.id), eq(schema.takes.number, FIRST_TAKE)),
      }))!;
    // Approve twice → the same keys → the same runs (attempt 0 replays).
    await requestNarration(project, scene, project.voice, memberId, narrateUsd, 0);
    await requestClip(project, scene, takeRow, seconds, memberId, clipUsd, 0);
    runs += 2;
  }
  return { runs };
}
