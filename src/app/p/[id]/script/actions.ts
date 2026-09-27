"use server";

import { revalidatePath } from "next/cache";

import { getCurrentMember } from "@/lib/auth";
import { approveScript } from "@/services/projects";
import {
  addScene,
  dropScene,
  keepSceneChange,
  moveScene,
  reviseScript,
  undoSceneChange,
  updateSceneText,
} from "@/services/script";
import { approveSkit, keepSkitRevision, reviseSkit, saveSkitBeats, undoSkitRevision, writeSkit } from "@/services/skit";
import type { ScenePlan } from "@/types/stick-skit/draft";

type ActionResult = { ok: true } | { ok: false; error: string };

function path(projectId: string) {
  return `/p/${projectId}/script`;
}

async function guarded(projectId: string, fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath(path(projectId));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function updateSceneTextAction(
  projectId: string,
  sceneId: string,
  field: "narration" | "visualPrompt",
  value: string,
): Promise<ActionResult> {
  return guarded(projectId, () => updateSceneText(sceneId, field, value));
}

export async function keepSceneChangeAction(projectId: string, sceneId: string): Promise<ActionResult> {
  return guarded(projectId, () => keepSceneChange(sceneId));
}

export async function undoSceneChangeAction(projectId: string, sceneId: string): Promise<ActionResult> {
  return guarded(projectId, () => undoSceneChange(sceneId));
}

export async function addSceneAction(projectId: string): Promise<ActionResult> {
  return guarded(projectId, () => addScene(projectId));
}

export async function dropSceneAction(projectId: string, sceneId: string): Promise<ActionResult> {
  return guarded(projectId, () => dropScene(sceneId));
}

export async function moveSceneAction(projectId: string, sceneId: string, direction: "up" | "down"): Promise<ActionResult> {
  return guarded(projectId, () => moveScene(projectId, sceneId, direction));
}

export async function reviseScriptAction(projectId: string, note: string): Promise<ActionResult> {
  if (!note.trim()) return { ok: false, error: "Say what to change." };
  const member = await getCurrentMember();
  return guarded(projectId, () => reviseScript(projectId, note.trim(), member.memberId));
}

export async function approveScriptAction(projectId: string): Promise<ActionResult> {
  const member = await getCurrentMember();
  return guarded(projectId, () => approveScript(projectId, member.memberId));
}

// stick_skit (09 §6 steps 3–4) ─────────────────────────────────────────────────

export async function writeSkitAction(projectId: string): Promise<ActionResult> {
  const member = await getCurrentMember();
  return guarded(projectId, () => writeSkit(projectId, member.memberId));
}

/**
 * Saves a beats edit. No revalidate: the browser already shows the re-checked skit, and a
 * re-render mid-typing would reset the editor. Returns the server's own verdict.
 */
export async function saveSkitBeatsAction(
  projectId: string,
  beats: unknown,
  scenePlan?: ScenePlan[],
): Promise<{ ok: true; errors: number } | { ok: false; error: string }> {
  try {
    const verdict = await saveSkitBeats(projectId, beats, scenePlan);
    return { ok: true, errors: verdict.check.errors };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong saving the skit." };
  }
}

/** `sourceCommentId`: the review comment this change came from, resolved once the revise lands. */
export async function reviseSkitAction(projectId: string, note: string, sourceCommentId?: string): Promise<ActionResult> {
  if (!note.trim()) return { ok: false, error: "Say what to change." };
  const member = await getCurrentMember();
  return guarded(projectId, () => reviseSkit(projectId, note.trim(), member.memberId, sourceCommentId));
}

export async function keepSkitRevisionAction(projectId: string): Promise<ActionResult> {
  return guarded(projectId, () => keepSkitRevision(projectId));
}

export async function undoSkitRevisionAction(projectId: string): Promise<ActionResult> {
  return guarded(projectId, () => undoSkitRevision(projectId));
}

export async function approveSkitAction(projectId: string): Promise<ActionResult> {
  const member = await getCurrentMember();
  return guarded(projectId, () => approveSkit(projectId, member.memberId));
}
