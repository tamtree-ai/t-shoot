/**
 * Edit-screen mutations (03 §2). Free edits change Tamshoot's document only. Paid edits
 * go through `requestRun`, so each one carries an estimate and a confirming member — the
 * UI only calls these after a confirmation dialog that showed the price. Nothing here is
 * called from a keystroke or a blur: editing text only ever *marks* work as pending.
 */
import "server-only";

import { and, asc, desc, eq, max } from "drizzle-orm";

import { db, schema } from "@/db";
import { fromMicros, toMicros } from "@/lib/spend-guard";
import { enqueueCancel } from "@/lib/queue";
import { aiClips } from "@/types/ai-clips";
import { assertFits } from "./dispatcher";
import { clipSeconds, requestClip, requestNarration } from "./filming";
import { estimateStageUsd } from "./ledger";

async function sceneAndProject(sceneId: string) {
  const [scene] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, sceneId));
  if (!scene) throw new Error("Scene not found.");
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, scene.projectId));
  return { scene, project };
}

async function sceneCount(projectId: string) {
  const rows = await db.select({ id: schema.scenes.id }).from(schema.scenes).where(eq(schema.scenes.projectId, projectId));
  return rows.length;
}

// ── free ───────────────────────────────────────────────────────────────────
export async function chooseTake(sceneId: string, takeId: string): Promise<void> {
  const [take] = await db.select().from(schema.takes).where(and(eq(schema.takes.id, takeId), eq(schema.takes.sceneId, sceneId)));
  if (!take?.clipAssetId) throw new Error("That take isn’t filmed yet.");
  await db.update(schema.scenes).set({ chosenTakeId: takeId, updatedAt: new Date() }).where(eq(schema.scenes.id, sceneId));
}

/** Fix a caption word. `text` null/empty clears the override. Free: the TimelineV1 draft only. */
export async function fixCaption(sceneId: string, phraseIndex: number, text: string | null): Promise<void> {
  const { scene } = await sceneAndProject(sceneId);
  const next = { ...scene.captionOverrides };
  if (text && text.trim() && text.trim() !== scene.phrases?.[phraseIndex]?.text) next[phraseIndex] = text.trim();
  else delete next[phraseIndex];
  await db.update(schema.scenes).set({ captionOverrides: next, updatedAt: new Date() }).where(eq(schema.scenes.id, sceneId));
}

/** A trim can never go below the narration's end (06 §4.2). */
export async function setTrim(sceneId: string, startS: number, endS: number | null): Promise<void> {
  const { scene } = await sceneAndProject(sceneId);
  const floor = scene.narrationDurationS ?? 0;
  if (startS < 0) throw new Error("The start can’t be before the clip begins.");
  if (endS !== null && endS - startS < floor - 1e-6) {
    throw new Error(`This scene can’t be shorter than its voice (${floor.toFixed(1)}s).`);
  }
  await db.update(schema.scenes).set({ trimStartS: startS, trimEndS: endS, updatedAt: new Date() }).where(eq(schema.scenes.id, sceneId));
}

/**
 * Typing in "What we hear". If the scene already has a recorded voice, it is now *out of
 * date* — nothing is re-recorded until the user confirms (06 §4.1).
 */
export async function updateNarration(sceneId: string, text: string): Promise<void> {
  const { scene } = await sceneAndProject(sceneId);
  const clean = text.trim();
  if (!clean) throw new Error("A scene needs something to say.");
  const changedFromVoice = scene.narrationAssetId ? clean !== recordedText(scene) : false;
  await db
    .update(schema.scenes)
    .set({ narration: clean, voiceOutOfDate: changedFromVoice, captionOverrides: {}, updatedAt: new Date() })
    .where(eq(schema.scenes.id, sceneId));
}

/** Undo: back to the words the current voice actually says. */
export async function undoNarration(sceneId: string): Promise<void> {
  const { scene } = await sceneAndProject(sceneId);
  if (!scene.phrases?.length) return;
  await db
    .update(schema.scenes)
    .set({ narration: recordedText(scene), voiceOutOfDate: false, updatedAt: new Date() })
    .where(eq(schema.scenes.id, sceneId));
}

function recordedText(scene: { phrases: { text: string }[] | null; narration: string }): string {
  return scene.phrases?.length ? scene.phrases.map((p) => p.text).join(" ") : scene.narration;
}

// ── paid (each needs the estimate + confirming member) ─────────────────────
export async function rerecordVoice(sceneId: string, memberId: string): Promise<void> {
  const { scene, project } = await sceneAndProject(sceneId);
  const usd = await estimateStageUsd(aiClips.flows.narrate);
  await assertFits(project.id, usd);
  await requestNarration(project, scene, project.voice, memberId, usd);
}

/** "Refilm" with new words for what we see, or "New take" with the same ones. */
export async function filmNewTake(sceneId: string, memberId: string, visualPrompt?: string): Promise<void> {
  const { scene, project } = await sceneAndProject(sceneId);
  const prompt = visualPrompt?.trim() || scene.visualPrompt;
  const usd = await estimateStageUsd(aiClips.flows.clip);
  await assertFits(project.id, usd);

  const [{ n }] = await db.select({ n: max(schema.takes.number) }).from(schema.takes).where(eq(schema.takes.sceneId, sceneId));
  const [take] = await db
    .insert(schema.takes)
    .values({ sceneId, number: (n ?? 0) + 1, visualPrompt: prompt })
    .returning();
  if (prompt !== scene.visualPrompt) {
    await db.update(schema.scenes).set({ visualPrompt: prompt, updatedAt: new Date() }).where(eq(schema.scenes.id, sceneId));
  }
  await requestClip(project, scene, take, clipSeconds(project, await sceneCount(project.id)), memberId, usd);
}

/** "Try again": the same take, the same inputs (07 §2). */
export async function retryClip(sceneId: string, memberId: string): Promise<void> {
  const { scene, project } = await sceneAndProject(sceneId);
  const [last] = await db
    .select()
    .from(schema.runs)
    .where(and(eq(schema.runs.sceneId, sceneId), eq(schema.runs.stage, aiClips.flows.clip)))
    .orderBy(desc(schema.runs.createdAt))
    .limit(1);
  if (!last?.takeId) throw new Error("Nothing to try again.");
  const [take] = await db.select().from(schema.takes).where(eq(schema.takes.id, last.takeId));
  const usd = await estimateStageUsd(aiClips.flows.clip);
  await assertFits(project.id, usd);
  await requestClip(project, scene, take, clipSeconds(project, await sceneCount(project.id)), memberId, usd);
}

export async function retryVoice(sceneId: string, memberId: string): Promise<void> {
  await rerecordVoice(sceneId, memberId);
}

/** Change the project's voice: every active scene is re-recorded, priced as a batch. */
export async function changeVoice(projectId: string, voice: string, memberId: string): Promise<void> {
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!project) throw new Error("Project not found.");
  const scenes = await db.select().from(schema.scenes).where(eq(schema.scenes.projectId, projectId)).orderBy(asc(schema.scenes.position));
  const active = scenes.filter((s) => !s.droppedAt);
  const usd = await estimateStageUsd(aiClips.flows.narrate);
  await assertFits(projectId, fromMicros(active.length * toMicros(usd)));
  const updated = { ...project, voice };
  await db.update(schema.projects).set({ voice, updatedAt: new Date() }).where(eq(schema.projects.id, projectId));
  for (const scene of active) await requestNarration(updated, scene, voice, memberId, usd);
}

export async function cancelRun(runId: string): Promise<void> {
  await enqueueCancel(runId);
}
