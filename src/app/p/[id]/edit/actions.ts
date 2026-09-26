"use server";

import { revalidatePath } from "next/cache";

import { getCurrentMember } from "@/lib/auth";
import { SpendGuardError } from "@/lib/spend-guard";
import { raiseProjectLimit } from "@/services/projects";
import { confirmChange, planChange, type ChangePlan } from "@/services/change";
import {
  cancelRun,
  changeVoice,
  chooseTake,
  filmNewTake,
  fixCaption,
  rerecordVoice,
  retryClip,
  setTrim,
  undoNarration,
  updateNarration,
} from "@/services/edit";
import { dropScene, moveScene } from "@/services/script";

type Result<T = undefined> = ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string; guard?: string };

async function guarded<T = undefined>(projectId: string, fn: (memberId: string) => Promise<T>): Promise<Result<T>> {
  try {
    const { memberId } = await getCurrentMember();
    const data = await fn(memberId);
    revalidatePath(`/p/${projectId}/edit`);
    return (data === undefined ? { ok: true } : { ok: true, data }) as Result<T>;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Something went wrong.",
      guard: err instanceof SpendGuardError ? err.reason : undefined,
    };
  }
}

// free
export const chooseTakeAction = async (p: string, sceneId: string, takeId: string) => guarded(p, () => chooseTake(sceneId, takeId));
export const fixCaptionAction = async (p: string, sceneId: string, i: number, text: string | null) => guarded(p, () => fixCaption(sceneId, i, text));
export const setTrimAction = async (p: string, sceneId: string, start: number, end: number | null) => guarded(p, () => setTrim(sceneId, start, end));
export const updateNarrationAction = async (p: string, sceneId: string, text: string) => guarded(p, () => updateNarration(sceneId, text));
export const undoNarrationAction = async (p: string, sceneId: string) => guarded(p, () => undoNarration(sceneId));
export const moveSceneAction = async (p: string, sceneId: string, dir: "up" | "down") => guarded(p, () => moveScene(p, sceneId, dir));
export const dropSceneAction = async (p: string, sceneId: string) => guarded(p, () => dropScene(sceneId));

// paid — the client only calls these after a confirmation that showed the price
export const rerecordVoiceAction = async (p: string, sceneId: string) => guarded(p, (m) => rerecordVoice(sceneId, m));
export const filmNewTakeAction = async (p: string, sceneId: string, prompt?: string) => guarded(p, (m) => filmNewTake(sceneId, m, prompt));
export const retryClipAction = async (p: string, sceneId: string) => guarded(p, (m) => retryClip(sceneId, m));
export const changeVoiceAction = async (p: string, voice: string) => guarded(p, (m) => changeVoice(p, voice, m));
export const cancelRunAction = async (p: string, runId: string) => guarded(p, () => cancelRun(runId));

// owner only, free
export async function raiseLimitAction(p: string): Promise<{ ok: true; limitUsd: string } | { ok: false; error: string }> {
  try {
    const limitUsd = await raiseProjectLimit(await getCurrentMember(), p);
    revalidatePath(`/p/${p}/edit`);
    return { ok: true, limitUsd };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

// Ask for a change
export const planChangeAction = async (p: string, sceneId: string, note: string, commentId?: string): Promise<Result<ChangePlan>> =>
  guarded(p, (m) => planChange(sceneId, note.trim(), m, commentId));
export const confirmChangeAction = async (p: string, changeId: string) => guarded(p, (m) => confirmChange(changeId, m));
