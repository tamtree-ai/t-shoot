/**
 * The Edit screen's read model: one serialisable object per project, built from
 * Tamshoot's document (scenes, takes) and its `runs` rows mapped through the state
 * machine. The UI never sees a raw Tamtree status.
 */
import "server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { estimateNarrationSeconds } from "@/lib/narration";
import { sceneLength } from "@/lib/timeline";
import { failureNotice, studioState, type FailureNotice, type StudioState } from "@/lib/run-state";
import type { StageFlow } from "@/lib/tamtree/stage-flows";
import { aiClips } from "@/types/ai-clips";
import { estimateStageUsd, projectSpend } from "./ledger";

export type TakeVM = { id: string; number: number; prompt: string; durationS: number | null; ready: boolean };
export type ActivityVM = { id: string; text: string; costUsd: string | null; at: string; stage: StageFlow; runId: string; tamtreeRunId: string | null };

export type SceneVM = {
  id: string;
  position: number;
  title: string;
  narration: string;
  visualPrompt: string;
  voiceOutOfDate: boolean;
  narrationDurationS: number | null;
  phrases: { text: string; start_s: number; end_s: number }[];
  captionOverrides: Record<number, string>;
  trimStartS: number;
  trimEndS: number | null;
  chosenTakeId: string | null;
  takes: TakeVM[];
  clip: StudioState & { failure?: FailureNotice; startedAt?: string; runId?: string; reused?: boolean };
  voice: StudioState & { failure?: FailureNotice; runId?: string };
  /** The single state shown on the timeline block and the stage header. */
  state: StudioState;
  costUsd: string;
  lengthS: number;
  /** Lowest allowed trim end: the narration's end (06 §4.2). */
  floorS: number;
  clipLengthS: number;
  activity: ActivityVM[];
  busy: boolean;
};

export type EditModel = {
  project: { id: string; title: string; voice: string; limitUsd: string; step: string; scriptApproved: boolean };
  scenes: SceneVM[];
  spentUsd: string;
  inflightUsd: string;
  totalLengthS: number;
  needsYou: string[];
  canExport: boolean;
  exportBlockedReason: string | null;
  anyBusy: boolean;
  /** What the next run of each paid stage would cost (ledger history, else declared maxima). */
  prices: { clip: string; narrate: string };
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const TERMINAL = ["completed", "failed", "cancelled"];

export async function getEditModel(projectId: string): Promise<EditModel | null> {
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!project) return null;

  const scenes = await db
    .select()
    .from(schema.scenes)
    .where(and(eq(schema.scenes.projectId, projectId), isNull(schema.scenes.droppedAt)))
    .orderBy(asc(schema.scenes.position));
  const sceneIds = new Set(scenes.map((s) => s.id));
  const allTakes = (await db.query.takes.findMany({ orderBy: asc(schema.takes.number) })).filter((t) => sceneIds.has(t.sceneId));
  const runs = await db.select().from(schema.runs).where(eq(schema.runs.projectId, projectId)).orderBy(desc(schema.runs.createdAt));
  const { spentUsd, inflightUsd } = await projectSpend(projectId);

  const vms: SceneVM[] = scenes.map((scene) => {
    const takes = allTakes.filter((t) => t.sceneId === scene.id);
    const sceneRuns = runs.filter((r) => r.sceneId === scene.id);
    const latest = (stage: StageFlow) => sceneRuns.find((r) => r.stage === stage);

    const facts = (r: (typeof runs)[number] | undefined, stage: StageFlow): StudioState & { failure?: FailureNotice; runId?: string; reused?: boolean; startedAt?: string } => {
      if (!r) return { word: "Not started", dot: "grey" };
      const out = r.output as { reused?: boolean } | null;
      const state = studioState({
        stage,
        status: r.status,
        reused: out?.reused,
        error: r.error,
        costUsd: r.costUsd,
        meteredSteps: r.meteredSteps,
        hasOutput: !!r.output,
      });
      return {
        ...state,
        runId: r.id,
        reused: out?.reused,
        startedAt: r.createdAt.toISOString(),
        failure: r.status === "failed" ? failureNotice({ error: r.error, costUsd: r.costUsd, meteredSteps: r.meteredSteps }, project.limitUsd) : undefined,
      };
    };
    const clip = facts(latest(aiClips.flows.clip), aiClips.flows.clip);
    const voice = facts(latest(aiClips.flows.narrate), aiClips.flows.narrate);

    const chosen = takes.find((t) => t.id === scene.chosenTakeId);
    const narrationS = scene.narrationDurationS ?? estimateNarrationSeconds(scene.narration);
    const clipLen = chosen?.durationS ?? takes.at(-1)?.durationS ?? narrationS;
    const lengthS = sceneLength(scene, chosen?.durationS ?? takes.at(-1)?.durationS ?? null);

    let state: StudioState = { word: "Ready", dot: "green" };
    if (clip.failure) state = clip;
    else if (voice.failure) state = voice;
    else if (!TERMINAL.includes(latest(aiClips.flows.clip)?.status ?? "completed") || clip.word === "Working") state = clip;
    else if (!TERMINAL.includes(latest(aiClips.flows.narrate)?.status ?? "completed") || voice.word === "Working") state = voice;
    else if (scene.voiceOutOfDate) state = { word: "Voice out of date", dot: "amber", triangle: true };
    else if (!latest(aiClips.flows.clip) && !chosen?.clipAssetId) state = { word: "Not filmed", dot: "grey" };
    else if (clip.reused) state = { word: "Reused · no charge", dot: "green" };

    const cost = sceneRuns.reduce((sum, r) => sum + Math.round(Number(r.costUsd ?? 0) * 1e6), 0);
    return {
      id: scene.id,
      position: scene.position,
      title: scene.title,
      narration: scene.narration,
      visualPrompt: scene.visualPrompt,
      voiceOutOfDate: scene.voiceOutOfDate,
      narrationDurationS: scene.narrationDurationS,
      phrases: scene.phrases ?? [],
      captionOverrides: scene.captionOverrides,
      trimStartS: scene.trimStartS,
      trimEndS: scene.trimEndS,
      chosenTakeId: scene.chosenTakeId,
      takes: takes.map((t) => ({ id: t.id, number: t.number, prompt: t.visualPrompt, durationS: t.durationS, ready: !!t.clipAssetId })),
      clip,
      voice,
      state,
      costUsd: (cost / 1e6).toFixed(3),
      lengthS,
      floorS: round1(narrationS),
      clipLengthS: round1(clipLen),
      activity: sceneRuns.slice(0, 6).map((r) => ({
        id: r.id,
        runId: r.id,
        tamtreeRunId: r.tamtreeRunId,
        stage: r.stage,
        costUsd: r.costUsd,
        at: r.createdAt.toISOString(),
        text: activityText(r.stage, r.status, r.input, r.output),
      })),
      busy: sceneRuns.some((r) => !TERMINAL.includes(r.status)),
    };
  });

  const needsYou = vms.filter((s) => s.state.dot === "amber").map((s) => s.id);
  const notReady = vms.filter((s) => s.state.dot !== "green");
  const exportBlockedReason = vms.some((s) => s.voiceOutOfDate)
    ? "A scene's voice is out of date."
    : notReady.length > 0
      ? `Scene ${notReady[0].position} isn’t ready yet.`
      : vms.length === 0
        ? "There are no scenes."
        : null;

  return {
    project: {
      id: project.id,
      title: project.title,
      voice: project.voice,
      limitUsd: project.limitUsd,
      step: project.step,
      scriptApproved: !!project.scriptApprovedAt,
    },
    scenes: vms,
    spentUsd,
    inflightUsd,
    totalLengthS: round1(vms.reduce((n, s) => n + s.lengthS, 0)),
    needsYou,
    canExport: exportBlockedReason === null,
    exportBlockedReason,
    anyBusy: vms.some((s) => s.busy),
    prices: { clip: await estimateStageUsd(aiClips.flows.clip), narrate: await estimateStageUsd(aiClips.flows.narrate) },
  };
}

function activityText(stage: StageFlow, status: string, input: unknown, output: unknown): string {
  const failed = status === "failed";
  const out = output as { reused?: boolean; duration_s?: number } | null;
  const inp = input as { take?: number; voice?: string };
  switch (stage) {
    case aiClips.flows.clip:
      if (failed) return `Couldn’t film take ${inp.take ?? 1}`;
      return out ? `${out.reused ? "Reused" : "Filmed"} take ${inp.take ?? 1}` : `Filming take ${inp.take ?? 1}`;
    case aiClips.flows.narrate:
      if (failed) return "Couldn’t record the voice";
      return out ? `Recorded ${inp.voice ?? "voice"} · ${out.duration_s?.toFixed(1)}s` : `Recording ${inp.voice ?? "voice"}`;
    case aiClips.flows.render:
      return failed ? "Couldn’t render" : out ? "Rendered" : "Rendering";
    default:
      return "Wrote the script";
  }
}
