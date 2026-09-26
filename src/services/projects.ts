import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import type { CurrentMember } from "@/lib/auth";
import type { Brief } from "@/lib/tamtree/stage-flows";
import { SCRIPT_PRICE_USD } from "@/lib/estimate";
import { aiClips, briefOutsideDefaults } from "@/types/ai-clips";
import { typeOf } from "@/types/registry";
import { getTypeDefaults } from "./type-settings";
import { startFilming } from "./filming";
import { runAndRecordStage } from "./runs";

export type NewBrief = Brief & { limitUsd: string };

/**
 * Brief → Script (03 §1.1–1.2). Creates the project, runs `studio-script` in `draft`
 * mode on the mock, and writes the resulting beats as scenes. One call because there is
 * no "brief" step to land on afterwards — the draft is the point of writing a brief.
 */
export async function createProjectFromBrief(memberId: string, orgId: string, input: NewBrief): Promise<string> {
  const brief = aiClips.configSchema.parse(input);
  const refusal = briefOutsideDefaults(brief, input.limitUsd, await getTypeDefaults(orgId, aiClips.kind));
  if (refusal) throw new Error(refusal);

  const [project] = await db
    .insert(schema.projects)
    .values({
      orgId,
      title: titleFromTopic(brief.topic),
      kind: aiClips.kind,
      catalogVersion: aiClips.catalogVersion(),
      step: "script",
      brief,
      limitUsd: input.limitUsd,
      createdBy: memberId,
    })
    .returning();

  const { output } = await runAndRecordStage({
    projectId: project.id,
    flow: aiClips.flows.script,
    input: { mode: "draft", brief },
    estimateUsd: SCRIPT_PRICE_USD.toString(),
    confirmedBy: memberId,
  });
  const beats = "beats" in output ? output.beats : [output.beat];

  await db.insert(schema.scenes).values(
    beats.map((beat, i) => ({
      projectId: project.id,
      position: i + 1,
      title: `Scene ${i + 1}`,
      narration: beat.narration,
      visualPrompt: beat.visual_prompt,
    })),
  );

  return project.id;
}

export async function getProject(projectId: string) {
  return (await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) })) ?? null;
}

/** The `ai_clips` draft: the scenes still in the film, in order. */
export async function getActiveScenes(projectId: string) {
  return db
    .select()
    .from(schema.scenes)
    .where(and(eq(schema.scenes.projectId, projectId), isNull(schema.scenes.droppedAt)))
    .orderBy(asc(schema.scenes.position));
}

export async function approveScript(projectId: string, memberId: string): Promise<void> {
  // Start filming first: if the spend guard refuses, the script stays unapproved.
  await startFilming(projectId, memberId);
  await db
    .update(schema.projects)
    .set({ scriptApprovedAt: new Date(), step: "edit", updatedAt: new Date() })
    .where(eq(schema.projects.id, projectId));
}

/**
 * "Raise limit" (a failure's `raise-limit` action): an owner lifts this video's limit to its
 * type's spend cap. Past the cap is a workspace decision, made in Settings.
 */
export async function raiseProjectLimit(member: CurrentMember, projectId: string): Promise<string> {
  if (member.role !== "owner") throw new Error("Only the workspace owner can raise a video's limit.");
  const project = await getProject(projectId);
  if (!project || project.orgId !== member.orgId) throw new Error("Project not found.");
  const cap = (await getTypeDefaults(member.orgId, typeOf(project).kind)).limit_usd;
  if (Number(project.limitUsd) >= Number(cap)) {
    throw new Error(`This video is already at the workspace cap of $${cap}. Change the cap in Settings.`);
  }
  await db.update(schema.projects).set({ limitUsd: cap, updatedAt: new Date() }).where(eq(schema.projects.id, projectId));
  return cap;
}

function titleFromTopic(topic: string): string {
  const oneLine = topic.trim().replace(/\s+/g, " ");
  return oneLine.length > 60 ? `${oneLine.slice(0, 59)}…` : oneLine;
}
