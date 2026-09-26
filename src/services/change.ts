/**
 * "Ask for a change" (03 §1.4, Direct.dc.html): a plain-language note about one scene.
 * `planChange` runs `studio-script revise-scene` (≈ $0.003) and works out which paid
 * actions the answer implies; nothing else is spent until `confirmChange`, which shows
 * the priced plan first and only then films / re-records.
 */
import "server-only";

import { eq, max } from "drizzle-orm";

import { db, schema } from "@/db";
import { SCRIPT_PRICE_USD } from "@/lib/estimate";
import { fromMicros, toMicros } from "@/lib/spend-guard";
import { aiClips } from "@/types/ai-clips";
import { assertFits } from "./dispatcher";
import { clipSeconds, requestClip, requestNarration } from "./filming";
import { estimateStageUsd, projectSpend } from "./ledger";
import { runAndRecordStage } from "./runs";

export type ChangePlan = {
  changeId: string;
  note: string;
  before: { narration: string; visualPrompt: string };
  after: { narration: string; visualPrompt: string };
  changed: { narration: boolean; visual_prompt: boolean };
  actions: { kind: "refilm" | "rerecord" | "keep-voice" | "keep-picture"; label: string; detail: string; costUsd: string }[];
  totalUsd: string;
  /** What the project's spend would be after the change (spent + on the way + this). */
  projectedUsd: string;
  limitUsd: string;
};

export async function planChange(sceneId: string, note: string, memberId: string, sourceCommentId?: string): Promise<ChangePlan> {
  const [scene] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, sceneId));
  if (!scene) throw new Error("Scene not found.");
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, scene.projectId));
  const siblings = await db.select().from(schema.scenes).where(eq(schema.scenes.projectId, scene.projectId));
  const ordered = siblings.filter((s) => !s.droppedAt).sort((a, b) => a.position - b.position);
  const i = ordered.findIndex((s) => s.id === sceneId);

  const { output } = await runAndRecordStage({
    projectId: project.id,
    sceneId,
    flow: aiClips.flows.script,
    input: {
      mode: "revise-scene",
      beat: { narration: scene.narration, visual_prompt: scene.visualPrompt },
      note,
      prev: ordered[i - 1]?.narration,
      next: ordered[i + 1]?.narration,
    },
    estimateUsd: SCRIPT_PRICE_USD.toString(),
    confirmedBy: memberId,
  });
  if (!("beat" in output)) throw new Error("The script step returned an unexpected answer.");

  const [clipUsd, voiceUsd] = await Promise.all([estimateStageUsd(aiClips.flows.clip), estimateStageUsd(aiClips.flows.narrate)]);
  const actions: ChangePlan["actions"] = [];
  let total = 0;
  if (output.changed.visual_prompt) {
    actions.push({ kind: "refilm", label: "Refilm this scene", detail: "About 2 minutes", costUsd: clipUsd });
    total += toMicros(clipUsd);
  } else {
    actions.push({ kind: "keep-picture", label: "Keep the picture", detail: "The shot doesn’t change", costUsd: "0" });
  }
  if (output.changed.narration) {
    actions.push({ kind: "rerecord", label: "Re-record the voice", detail: "The words change", costUsd: voiceUsd });
    total += toMicros(voiceUsd);
  } else {
    actions.push({ kind: "keep-voice", label: "Keep the voice", detail: "The words don’t change", costUsd: "0" });
  }

  const { spentUsd, inflightUsd } = await projectSpend(project.id);
  const totalUsd = fromMicros(total);
  const projected = toMicros(spentUsd) + toMicros(inflightUsd) + total;
  const plan = {
    before: { narration: scene.narration, visualPrompt: scene.visualPrompt },
    after: { narration: output.beat.narration, visualPrompt: output.beat.visual_prompt },
    changed: output.changed,
    actions,
    totalUsd,
    projectedUsd: fromMicros(projected),
    limitUsd: project.limitUsd,
  };
  const [row] = await db
    .insert(schema.changeRequests)
    .values({ sceneId, note, sourceCommentId, plan, estimateUsd: totalUsd })
    .returning({ id: schema.changeRequests.id });
  return { changeId: row.id, note, ...plan };
}

export async function confirmChange(changeId: string, memberId: string): Promise<void> {
  const [change] = await db.select().from(schema.changeRequests).where(eq(schema.changeRequests.id, changeId));
  if (!change || change.confirmedAt) throw new Error("This change was already applied.");
  const plan = change.plan as unknown as Pick<ChangePlan, "after" | "changed" | "totalUsd">;
  const [scene] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, change.sceneId));
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, scene.projectId));
  await assertFits(project.id, plan.totalUsd);

  const narrationChanged = plan.changed.narration && plan.after.narration !== scene.narration;
  const visualChanged = plan.changed.visual_prompt && plan.after.visualPrompt !== scene.visualPrompt;
  const [updated] = await db
    .update(schema.scenes)
    .set({
      narration: narrationChanged ? plan.after.narration : scene.narration,
      visualPrompt: visualChanged ? plan.after.visualPrompt : scene.visualPrompt,
      voiceOutOfDate: narrationChanged && !!scene.narrationAssetId,
      updatedAt: new Date(),
    })
    .where(eq(schema.scenes.id, scene.id))
    .returning();

  if (narrationChanged) await requestNarration(project, updated, project.voice, memberId, await estimateStageUsd(aiClips.flows.narrate));
  if (visualChanged) {
    const [{ n }] = await db.select({ n: max(schema.takes.number) }).from(schema.takes).where(eq(schema.takes.sceneId, scene.id));
    const [take] = await db
      .insert(schema.takes)
      .values({ sceneId: scene.id, number: (n ?? 0) + 1, visualPrompt: updated.visualPrompt })
      .returning();
    const count = (await db.select({ id: schema.scenes.id }).from(schema.scenes).where(eq(schema.scenes.projectId, project.id))).length;
    await requestClip(project, updated, take, clipSeconds(project, count), memberId, await estimateStageUsd(aiClips.flows.clip));
  }
  await db.update(schema.changeRequests).set({ confirmedBy: memberId, confirmedAt: new Date() }).where(eq(schema.changeRequests.id, changeId));
  if (change.sourceCommentId) {
    await db.update(schema.comments).set({ resolvedByChangeRequestId: changeId }).where(eq(schema.comments.id, change.sourceCommentId));
  }
}
