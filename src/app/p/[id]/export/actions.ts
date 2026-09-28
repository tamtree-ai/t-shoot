"use server";

import { revalidatePath } from "next/cache";

import { getCurrentMember } from "@/lib/auth";
import { requestFinalRender } from "@/services/export";
import { savePublication, sendPublication } from "@/services/publish";
import { PLATFORMS, type Platform } from "@/types/social/post";

export async function renderAction(projectId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { memberId } = await getCurrentMember();
    await requestFinalRender(projectId, memberId);
    revalidatePath(`/p/${projectId}/export`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function savePublicationAction(
  projectId: string,
  versionId: string,
  platform: Platform,
  payload: unknown,
  confirm: boolean,
): Promise<{ ok: true; status: "draft" | "confirmed" } | { ok: false; error: string }> {
  try {
    if (!PLATFORMS.includes(platform)) return { ok: false, error: "That platform is not set up." };
    const saved = await savePublication(projectId, versionId, platform, payload, confirm);
    revalidatePath(`/p/${projectId}/export`);
    revalidatePath("/");
    return { ok: true, status: saved.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The post was not saved." };
  }
}

export async function sendPublicationAction(
  projectId: string,
  versionId: string,
  platform: Platform,
): Promise<{ ok: true; result: string | null } | { ok: false; error: string }> {
  try {
    const saved = await sendPublication(projectId, versionId, platform);
    revalidatePath(`/p/${projectId}/export`);
    revalidatePath("/");
    return { ok: true, result: saved.result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The post was not sent." };
  }
}
