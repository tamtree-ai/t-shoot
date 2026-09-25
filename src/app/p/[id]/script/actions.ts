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
  return guarded(projectId, () => approveScript(projectId));
}
