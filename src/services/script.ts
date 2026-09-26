import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { SCRIPT_PRICE_USD } from "@/lib/estimate";
import { aiClips } from "@/types/ai-clips";
import { runAndRecordStage } from "./runs";

/**
 * "Ask for a script change" (03 §1.2): reruns `studio-script` in `revise` mode over
 * every scene, then tags whichever scenes the flow reports as changed with the note,
 * pending the user's Keep or Undo (Script.dc.html's "Changed by your note" pill).
 */
export async function reviseScript(projectId: string, note: string, memberId: string): Promise<void> {
  const scenes = await activeScenes(projectId);
  if (scenes.length === 0) return;

  const { output } = await runAndRecordStage({
    projectId,
    flow: aiClips.flows.script,
    input: {
      mode: "revise",
      beats: scenes.map((s) => ({ narration: s.narration, visual_prompt: s.visualPrompt })),
      note,
    },
    estimateUsd: SCRIPT_PRICE_USD.toString(),
    confirmedBy: memberId,
  });
  if (!("beats" in output)) return;

  await Promise.all(
    scenes.map((scene, i) => {
      const beat = output.beats[i];
      const changed = output.changed?.[i] ?? false;
      if (!beat || !changed) return Promise.resolve();
      return db
        .update(schema.scenes)
        .set({
          narration: beat.narration,
          visualPrompt: beat.visual_prompt,
          revisionNote: note,
          previousNarration: scene.narration,
          previousVisualPrompt: scene.visualPrompt,
          updatedAt: new Date(),
        })
        .where(eq(schema.scenes.id, scene.id));
    }),
  );
}

export async function keepSceneChange(sceneId: string): Promise<void> {
  await clearRevision(sceneId);
}

export async function undoSceneChange(sceneId: string): Promise<void> {
  const [scene] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, sceneId)).limit(1);
  if (!scene || !scene.revisionNote) return;
  await db
    .update(schema.scenes)
    .set({
      narration: scene.previousNarration ?? scene.narration,
      visualPrompt: scene.previousVisualPrompt ?? scene.visualPrompt,
      revisionNote: null,
      previousNarration: null,
      previousVisualPrompt: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.scenes.id, sceneId));
}

/** A free, direct edit (03 §1.2: "every cell is editable in place"). Overrides any pending revise. */
export async function updateSceneText(sceneId: string, field: "narration" | "visualPrompt", value: string): Promise<void> {
  const [scene] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, sceneId)).limit(1);
  if (!scene) return;
  await db
    .update(schema.scenes)
    .set({
      [field]: value,
      voiceOutOfDate: field === "narration" && scene.narrationAssetId !== null ? true : scene.voiceOutOfDate,
      revisionNote: null,
      previousNarration: null,
      previousVisualPrompt: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.scenes.id, sceneId));
}

export async function addScene(projectId: string): Promise<void> {
  const scenes = await activeScenes(projectId);
  const position = (scenes.at(-1)?.position ?? 0) + 1;
  await db.insert(schema.scenes).values({
    projectId,
    position,
    title: `Scene ${position}`,
    narration: "",
    visualPrompt: "",
  });
}

export async function dropScene(sceneId: string): Promise<void> {
  await db.update(schema.scenes).set({ droppedAt: new Date() }).where(eq(schema.scenes.id, sceneId));
}

export async function moveScene(projectId: string, sceneId: string, direction: "up" | "down"): Promise<void> {
  const scenes = await activeScenes(projectId);
  const index = scenes.findIndex((s) => s.id === sceneId);
  const neighbourIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || neighbourIndex < 0 || neighbourIndex >= scenes.length) return;
  const a = scenes[index];
  const b = scenes[neighbourIndex];
  await db.transaction(async (tx) => {
    await tx.update(schema.scenes).set({ position: b.position }).where(eq(schema.scenes.id, a.id));
    await tx.update(schema.scenes).set({ position: a.position }).where(eq(schema.scenes.id, b.id));
  });
}

async function activeScenes(projectId: string) {
  return db
    .select()
    .from(schema.scenes)
    .where(and(eq(schema.scenes.projectId, projectId), isNull(schema.scenes.droppedAt)))
    .orderBy(asc(schema.scenes.position));
}

async function clearRevision(sceneId: string): Promise<void> {
  await db
    .update(schema.scenes)
    .set({ revisionNote: null, previousNarration: null, previousVisualPrompt: null, updatedAt: new Date() })
    .where(eq(schema.scenes.id, sceneId));
}
