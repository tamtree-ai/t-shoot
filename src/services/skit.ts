/**
 * The stick-skit draft (09 §6 steps 3–4): writing it (`stick-script` draft), the owner's free
 * edits (re-checked in-process, no run), "Ask for a change" (`stick-script` revise, with one
 * step of undo) and the gate before paid work. One `skit_drafts` row per project.
 */
import "server-only";

import { and, desc, eq, like } from "drizzle-orm";

import { db, schema } from "@/db";
import { STICK_SCRIPT_PRICE_USD } from "@/lib/estimate";
import { prepareWriterBrief } from "@/lib/stick/writer-brief";
import { Skit, type StickProduceIn, type StickScriptOut } from "@/lib/tamtree/stage-flows";
import { timelineDigest } from "@/lib/timeline";
import { estimateProduce, stickSkit } from "@/types/stick-skit";
import { characterName } from "@/types/stick-skit/catalog";
import { canApprove, castOf, judgeSkit, withBeats, type ScenePlan, type SkitVerdict } from "@/types/stick-skit/draft";
import { requestRun } from "./dispatcher";
import { getProject } from "./projects";
import { getProjectComment } from "./review";
import { runAndRecordStage } from "./runs";
import { characterNotes, listCharacters } from "./cast";
import { getTypeDefaults } from "./type-settings";

export type SkitDraft = typeof schema.skitDrafts.$inferSelect;

export async function getSkitDraft(projectId: string): Promise<SkitDraft | null> {
  const [row] = await db.select().from(schema.skitDrafts).where(eq(schema.skitDrafts.projectId, projectId)).limit(1);
  return row ?? null;
}

/** A stick-skit project, with its pinned catalog still the one t-shoot ships. */
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

/** Keep workspace character documents on the skit when a rewrite forgets them. */
function keepCharacters(skit: Skit, sources: unknown[]): Skit {
  const docs = sources.flatMap((source) => {
    if (!source || typeof source !== "object") return [];
    const list = (source as { characters?: unknown }).characters;
    return Array.isArray(list) ? list : [];
  });
  if (!docs.length) return skit;
  const prev = Array.isArray(skit.characters) ? skit.characters : [];
  const ids = new Set(prev.flatMap((c) => (c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string" ? [(c as { id: string }).id] : [])));
  const extra = docs.filter((c) => c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string" && !ids.has((c as { id: string }).id));
  if (!extra.length) return skit;
  return { ...skit, characters: [...prev, ...extra] };
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
  const forWriter = prepareWriterBrief(brief, defaults.allowed_sets);
  delete forWriter.target_s;
  const notes = characterNotes(await listCharacters(project.orgId), brief.cast.map((c) => c.character));
  if (notes) forWriter.description = [forWriter.description, notes].filter(Boolean).join("\n").slice(0, 2000);

  const { output } = await runAndRecordStage({
    projectId,
    flow: stickSkit.flows.script,
    input: { mode: "draft", catalog_version: catalogVersion, brief: forWriter },
    estimateUsd: STICK_SCRIPT_PRICE_USD.toString(),
    confirmedBy: memberId,
  });
  const written = output as StickScriptOut;
  await saveOutput(projectId, catalogVersion, { ...written, skit: keepCharacters(written.skit, [brief]) }, { previousSkit: null, revisionNote: null });
}

/**
 * "Ask for a change": `stick-script` in revise mode over the skit as it stands, undoable once.
 * When it started from a review comment (09 §6.6), the change is recorded and the comment
 * resolved once the revise lands.
 */
export async function reviseSkit(projectId: string, note: string, memberId: string, sourceCommentId?: string): Promise<void> {
  const { catalogVersion } = await stickProject(projectId);
  const draft = await requireDraft(projectId);

  const { output } = await runAndRecordStage({
    projectId,
    flow: stickSkit.flows.script,
    input: { mode: "revise", catalog_version: catalogVersion, skit: draft.skit, note },
    estimateUsd: STICK_SCRIPT_PRICE_USD.toString(),
    confirmedBy: memberId,
  });
  const written = output as StickScriptOut;
  await saveOutput(projectId, catalogVersion, { ...written, skit: keepCharacters(written.skit, [draft.skit]) }, { previousSkit: draft.skit, revisionNote: note });
  if (sourceCommentId) await resolveComment(projectId, sourceCommentId, note, memberId);
}

async function resolveComment(projectId: string, commentId: string, note: string, memberId: string): Promise<void> {
  const comment = await getProjectComment(projectId, commentId);
  if (!comment || comment.resolved) return;
  await db.transaction(async (tx) => {
    const [change] = await tx
      .insert(schema.changeRequests)
      .values({ projectId, note, sourceCommentId: commentId, estimateUsd: STICK_SCRIPT_PRICE_USD.toString(), confirmedBy: memberId, confirmedAt: new Date() })
      .returning({ id: schema.changeRequests.id });
    await tx.update(schema.comments).set({ resolvedByChangeRequestId: change.id }).where(eq(schema.comments.id, commentId));
  });
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
    warnings: Array.isArray(out.warnings) ? out.warnings : [],
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
export async function saveSkitBeats(
  projectId: string,
  beats: unknown,
  scenePlan?: ScenePlan[],
  extras?: { set?: string | null; cast?: { id: string; character: string; label?: string }[] },
): Promise<SkitVerdict> {
  const { project } = await stickProject(projectId);
  const draft = await requireDraft(projectId);
  let skit = withBeats(Skit.parse(draft.skit), beats, scenePlan);
  if (extras?.set) skit = { ...skit, set: extras.set };
  if (extras?.set === null) {
    const rest = { ...skit };
    delete rest.set;
    skit = rest;
  }
  if (extras?.cast) skit = { ...skit, cast: extras.cast };
  if (extras?.set !== undefined || extras?.cast) {
    const brief = stickSkit.configSchema.parse(project.brief);
    const next = {
      ...brief,
      ...(extras.set ? { set: extras.set } : {}),
      ...(extras.cast ? { cast: extras.cast } : {}),
    };
    if (extras.set === null) delete next.set;
    await db.update(schema.projects).set({ brief: next, updatedAt: new Date() }).where(eq(schema.projects.id, projectId));
  }
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
      warnings: [],
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

/** What `stick-produce` is asked for: the approved skit, each character's voice, the pinned catalog. */
export async function produceInput(projectId: string): Promise<{ input: StickProduceIn; verdict: SkitVerdict }> {
  const { project, catalogVersion } = await stickProject(projectId);
  const { draft, verdict } = await approvableSkit(projectId);
  const skit = Skit.parse(draft.skit);
  const { voice_map } = await getTypeDefaults(project.orgId, stickSkit.kind);
  const voices: Record<string, string> = {};
  for (const { character } of castOf(skit)) {
    const voice = voice_map[character];
    if (!voice) throw new Error(`Give ${characterName(character)} a voice in Settings first.`);
    voices[character] = voice;
  }
  return { input: { catalog_version: catalogVersion, skit, voices }, verdict };
}

/** The idempotency digest of a produce request: the same skit, voices and catalog make one run. */
export const produceDigest = (input: StickProduceIn) => timelineDigest(input);

/**
 * "Approve and make the video": one `stick-produce` run through the spend guard. Its key is
 * `(skit, voices, catalog_version)` plus the failed attempts so far, so a double Approve
 * collapses into one run and approving an unchanged skit again never re-renders it, while
 * a failed run can still be tried again.
 */
export async function approveSkit(projectId: string, memberId: string): Promise<void> {
  const { input, verdict } = await produceInput(projectId);
  const digest = produceDigest(input);
  const prefix = `stick-produce:${projectId}:${digest}:`;
  const failed = await db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(and(like(schema.runs.idempotencyKey, `${prefix}%`), eq(schema.runs.status, "failed")));

  await requestRun({
    projectId,
    flow: stickSkit.flows.produce,
    input,
    estimateUsd: estimateProduce(verdict.lines.length).totalUsd.toFixed(6),
    confirmedBy: memberId,
    idempotencyKey: `${prefix}${failed.length}`,
  });
  await db.update(schema.projects).set({ scriptApprovedAt: new Date(), updatedAt: new Date() }).where(eq(schema.projects.id, projectId));
}

export type ProduceState = {
  runId: string;
  status: string;
  /** Whether this run was for the skit as it stands now. */
  current: boolean;
  error: { code: string; message: string } | null;
  costUsd: string | null;
  meteredSteps: number | null;
  versionNumber: number | null;
};

/** The latest `stick-produce` run, for the script step's "Making the video" panel. */
export async function getProduceState(projectId: string, draft: SkitDraft | null): Promise<ProduceState | null> {
  const [run] = await db
    .select()
    .from(schema.runs)
    .where(and(eq(schema.runs.projectId, projectId), eq(schema.runs.flow, stickSkit.flows.produce)))
    .orderBy(desc(schema.runs.createdAt))
    .limit(1);
  if (!run) return null;
  const input = run.input as StickProduceIn;
  const digest = produceDigest(input);
  const [version] = await db
    .select({ number: schema.projectVersions.number })
    .from(schema.projectVersions)
    .where(and(eq(schema.projectVersions.projectId, projectId), eq(schema.projectVersions.digest, digest)))
    .limit(1);
  return {
    runId: run.id,
    status: run.status,
    current: !!draft && timelineDigest(input.skit) === draft.digest,
    error: run.error,
    costUsd: run.costUsd,
    meteredSteps: run.meteredSteps,
    versionNumber: version?.number ?? null,
  };
}
