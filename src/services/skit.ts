/**
 * The stick-skit draft (09 §6 steps 3–4): writing it (`stick-script` draft), the owner's free
 * edits (re-checked in-process, no run), "Ask for a change" (`stick-script` revise, with one
 * step of undo) and the gate before paid work. One `skit_drafts` row per project.
 */
import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { STICK_SCRIPT_PRICE_USD } from "@/lib/estimate";
import { Skit, type StickScriptOut } from "@/lib/tamtree/stage-flows";
import { timelineDigest } from "@/lib/timeline";
import { stickSkit } from "@/types/stick-skit";
import { canApprove, judgeSkit, withBeats, type SkitVerdict } from "@/types/stick-skit/draft";
import { getProject } from "./projects";
import { runAndRecordStage } from "./runs";
import { getTypeDefaults } from "./type-settings";

export type SkitDraft = typeof schema.skitDrafts.$inferSelect;

export async function getSkitDraft(projectId: string): Promise<SkitDraft | null> {
  const [row] = await db.select().from(schema.skitDrafts).where(eq(schema.skitDrafts.projectId, projectId)).limit(1);
  return row ?? null;
}

/** A stick-skit project, with its pinned catalog still the one Studio ships. */
async function stickProject(projectId: string) {
  const project = await getProject(projectId);
  if (!project || project.kind !== stickSkit.kind) throw new Error("Project not found.");
  if (!project.catalogVersion) throw new Error("This project has no pinned catalog.");
  await stickSkit.catalog(project.catalogVersion);
  return { project, catalogVersion: project.catalogVersion };
}

async function requireDraft(projectId: string): Promise<SkitDraft> {
  const draft = await getSkitDraft(projectId);
  if (!draft) throw new Error("There's no skit yet. Write it first.");
  return draft;
}

const fromVerdict = (v: SkitVerdict) => ({
  lines: v.lines,
  check: v.check,
  estimatedDurationS: v.estimatedDurationS,
});

/** "Write the skit" (~$0.01): `stick-script` in draft mode, kept inside the workspace's sets. */
export async function writeSkit(projectId: string, memberId: string): Promise<void> {
  const { project, catalogVersion } = await stickProject(projectId);
  const brief = stickSkit.configSchema.parse(project.brief);
  const defaults = await getTypeDefaults(project.orgId, stickSkit.kind);

  const { output } = await runAndRecordStage({
    projectId,
    flow: stickSkit.flows.script,
    input: { mode: "draft", catalog_version: catalogVersion, brief: { ...brief, allowed_sets: defaults.allowed_sets } },
    estimateUsd: STICK_SCRIPT_PRICE_USD.toString(),
    confirmedBy: memberId,
  });
  await saveOutput(projectId, catalogVersion, output as StickScriptOut, { previousSkit: null, revisionNote: null });
}

/** "Ask for a change": `stick-script` in revise mode over the skit as it stands, undoable once. */
export async function reviseSkit(projectId: string, note: string, memberId: string): Promise<void> {
  const { catalogVersion } = await stickProject(projectId);
  const draft = await requireDraft(projectId);

  const { output } = await runAndRecordStage({
    projectId,
    flow: stickSkit.flows.script,
    input: { mode: "revise", catalog_version: catalogVersion, skit: draft.skit, note },
    estimateUsd: STICK_SCRIPT_PRICE_USD.toString(),
    confirmedBy: memberId,
  });
  await saveOutput(projectId, catalogVersion, output as StickScriptOut, { previousSkit: draft.skit, revisionNote: note });
}

async function saveOutput(
  projectId: string,
  catalogVersion: string,
  out: StickScriptOut,
  revision: { previousSkit: Record<string, unknown> | null; revisionNote: string | null },
): Promise<void> {
  const row = {
    skit: out.skit,
    lines: out.lines,
    check: out.check,
    estimatedDurationS: out.estimated_duration_s,
    catalogVersion,
    digest: timelineDigest(out.skit),
    source: "llm" as const,
    ...revision,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.skitDrafts)
    .values({ projectId, ...row, ...(out.premise ? { premise: out.premise } : {}) })
    .onConflictDoUpdate({ target: schema.skitDrafts.projectId, set: { ...row, ...(out.premise ? { premise: out.premise } : {}) } });
}

/**
 * The owner's edit from the beats editor: only the beats are taken (OD-12), re-checked here as
 * the browser already did. A direct edit settles any pending "Ask for a change".
 */
export async function saveSkitBeats(projectId: string, beats: unknown): Promise<SkitVerdict> {
  await stickProject(projectId);
  const draft = await requireDraft(projectId);
  const skit = withBeats(Skit.parse(draft.skit), beats);
  const verdict = judgeSkit(skit);
  await db
    .update(schema.skitDrafts)
    .set({
      skit,
      ...fromVerdict(verdict),
      digest: timelineDigest(skit),
      source: "edited",
      previousSkit: null,
      revisionNote: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.skitDrafts.projectId, projectId));
  return verdict;
}

export async function keepSkitRevision(projectId: string): Promise<void> {
  await db
    .update(schema.skitDrafts)
    .set({ previousSkit: null, revisionNote: null, updatedAt: new Date() })
    .where(eq(schema.skitDrafts.projectId, projectId));
}

/** Undo the last "Ask for a change": the skit as it was before it. */
export async function undoSkitRevision(projectId: string): Promise<void> {
  const draft = await requireDraft(projectId);
  if (!draft.previousSkit) return;
  const skit = Skit.parse(draft.previousSkit);
  await db
    .update(schema.skitDrafts)
    .set({
      skit,
      ...fromVerdict(judgeSkit(skit)),
      digest: timelineDigest(skit),
      previousSkit: null,
      revisionNote: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.skitDrafts.projectId, projectId));
}

/**
 * The gate itself, re-judged on the server from the stored skit: whatever the browser showed,
 * a skit the check fails is never sent to be voiced.
 */
export async function approvableSkit(projectId: string): Promise<{ draft: SkitDraft; verdict: SkitVerdict }> {
  await stickProject(projectId);
  const draft = await requireDraft(projectId);
  const verdict = judgeSkit(draft.skit);
  if (!canApprove(verdict)) {
    const n = verdict.check.errors;
    throw new Error(`Fix ${n === 1 ? "the problem" : `the ${n} problems`} the check found first.`);
  }
  return { draft, verdict };
}

/** "Approve and make the video". K3 stops at the gate; K4 starts `stick-produce` from here. */
export async function approveSkit(projectId: string, _memberId: string): Promise<void> {
  await approvableSkit(projectId);
  throw new Error("The skit passes. Making the video isn't wired up yet.");
}
