"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { getCurrentMember, canSpend } from "@/lib/auth";
import { clampMusicVolume } from "@/lib/music";
import { LANGUAGES, type LanguageId } from "@/lib/languages";
import { createClipsFromPaste, createStickFromPaste } from "@/services/paste";
import { readPublicLink } from "@/services/fetch-link";
import { summariseLink, writeHooks, writeTitles } from "@/services/writer-jobs";
import { makeLanguageVersion } from "@/services/translate";
import { addIdeas, deleteIdea, draftAheadForShow, reorderIdeas } from "@/services/show-ideas";
import { deleteCharacter, saveCharacter } from "@/services/cast";
import { mintApiToken } from "@/services/agent";
import { acceptInvite, clearSessionCookie, inviteMember, requestMagicLink, setSlackWebhook, setVoiceCloneConsent, updateNotifyPrefs } from "@/services/workspace";
import { reviseSkit } from "@/services/skit";
import { saveShow, type ShowConfig } from "@/services/shows";
import { editBeat } from "@/types/stick-skit/draft";
import type { Skit } from "@/lib/tamtree/stage-flows";
import { getSkitDraft } from "@/services/skit";

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function fail(err: unknown): { ok: false; error: string } {
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
}

export async function pasteStickAction(input: {
  script: string;
  mapping: Record<string, string>;
  setId: string;
  limitUsd: string;
  showId?: string;
  episodeNumber?: number;
}): Promise<{ ok: false; error: string } | void> {
  const member = await getCurrentMember();
  try {
    const id = await createStickFromPaste(member.memberId, member.orgId, input);
    redirect(`/p/${id}/script`);
  } catch (err) {
    if (typeof err === "object" && err && "digest" in err) throw err;
    return fail(err);
  }
}

export async function pasteClipsAction(script: string, limitUsd: string): Promise<{ ok: false; error: string } | void> {
  const member = await getCurrentMember();
  try {
    const id = await createClipsFromPaste(member.memberId, member.orgId, script, limitUsd);
    redirect(`/p/${id}/script`);
  } catch (err) {
    if (typeof err === "object" && err && "digest" in err) throw err;
    return fail(err);
  }
}

export async function topicsFromLinkAction(url: string): Promise<{ ok: true; topics: { title: string; line: string }[] } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  if (!canSpend(member.role)) return { ok: false, error: "Clients don't start paid work." };
  try {
    const page = await readPublicLink(url);
    const topics = await summariseLink(member, page);
    return { ok: true, topics };
  } catch (err) {
    return fail(err);
  }
}

export async function hooksAction(projectId: string, line: string, topic: string): Promise<{ ok: true; hooks: string[] } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  try {
    const hooks = await writeHooks(member, projectId, { line, topic });
    return { ok: true, hooks };
  } catch (err) {
    return fail(err);
  }
}

export async function titlesAction(projectId: string, title: string, lines: string[]): Promise<{ ok: true; pairs: { title: string; cover: "opening" | "slam" | "end" }[] } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  try {
    const pairs = await writeTitles(member, projectId, { title, lines });
    return { ok: true, pairs };
  } catch (err) {
    return fail(err);
  }
}

export async function tidyAction(projectId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  try {
    await reviseSkit(projectId, "Fix slams and pauses for timing. Do not rewrite the lines.", member.memberId);
    revalidatePath(`/p/${projectId}/script`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function musicAction(projectId: string, bed: string | null, volume: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  try {
    await db
      .update(schema.projects)
      .set({
        musicBed: bed,
        musicVolume: clampMusicVolume(volume),
        lastTouchedBy: member.memberId,
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, projectId));
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function applyHookAction(projectId: string, beatId: string, line: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const draft = await getSkitDraft(projectId);
    if (!draft) return { ok: false, error: "There's no script yet." };
    const next = editBeat(draft.skit as Skit, beatId, { line });
    const { saveSkitBeats } = await import("@/services/skit");
    const beats = (await import("@/types/stick-skit/draft")).allBeats(next);
    await saveSkitBeats(projectId, beats);
    revalidatePath(`/p/${projectId}/script`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function translateAction(projectId: string, language: string): Promise<{ ok: false; error: string } | void> {
  const member = await getCurrentMember();
  if (!LANGUAGES.some((l) => l.id === language)) return { ok: false, error: "That language isn't available." };
  try {
    const id = await makeLanguageVersion(member, projectId, language as LanguageId);
    redirect(`/p/${id}/script`);
  } catch (err) {
    if (typeof err === "object" && err && "digest" in err) throw err;
    return fail(err);
  }
}

export async function magicLinkAction(email: string): Promise<{ ok: true; devLink?: string } | { ok: false; error: string }> {
  try {
    const result = await requestMagicLink(email, await origin());
    return { ok: true, ...result };
  } catch (err) {
    return fail(err);
  }
}

export async function inviteAction(email: string, role: "editor" | "client"): Promise<{ ok: true; devLink?: string } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  if (member.role !== "owner") return { ok: false, error: "Only the owner can invite." };
  try {
    const result = await inviteMember(member.orgId, member.memberId, email, role, await origin());
    return { ok: true, ...result };
  } catch (err) {
    return fail(err);
  }
}

export async function acceptInviteAction(token: string, name: string): Promise<{ ok: false; error: string } | void> {
  try {
    await acceptInvite(token, name);
  } catch (err) {
    return fail(err);
  }
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/sign-in");
}

export async function notifyPrefsAction(prefs: {
  notifyComment: boolean;
  notifyApproved: boolean;
  notifyFilm: boolean;
  notifyLive: boolean;
  notifySlack: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  try {
    await updateNotifyPrefs(member.memberId, prefs);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function slackAction(url: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  if (member.role !== "owner") return { ok: false, error: "Only the owner can set Slack." };
  try {
    await setSlackWebhook(member.orgId, url);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function voiceConsentAction(consent: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  try {
    await setVoiceCloneConsent(member.memberId, consent);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function ideasAction(showId: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  try {
    await addIdeas(member.orgId, showId, text.split("\n"));
    revalidatePath(`/shows/${showId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function reorderIdeasAction(showId: string, ids: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  try {
    await reorderIdeas(member.orgId, showId, ids);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteIdeaAction(showId: string, ideaId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  try {
    await deleteIdea(member.orgId, showId, ideaId);
    revalidatePath(`/shows/${showId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function draftNowAction(showId: string): Promise<{ ok: true; wrote: number } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  if (!canSpend(member.role)) return { ok: false, error: "Clients don't start paid work." };
  try {
    const wrote = await draftAheadForShow(member.orgId, member.memberId, showId);
    revalidatePath("/");
    return { ok: true, wrote };
  } catch (err) {
    return fail(err);
  }
}

export async function saveShowAction(showId: string, config: ShowConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  if (member.role === "client") return { ok: false, error: "Clients can't change a show." };
  try {
    await saveShow(member.orgId, config, showId);
    revalidatePath(`/shows/${showId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function saveCharacterAction(input: {
  name: string;
  body: string;
  color: string;
  hair: string;
  accessory: string;
  personality: string;
  original?: boolean;
  height?: number;
  head?: number;
  limb?: "line" | "bean";
  shoe?: string;
  say?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  try {
    await saveCharacter(member.orgId, input);
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteCharacterAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  try {
    await deleteCharacter(member.orgId, id);
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function mintTokenAction(name: string, dailyCapUsd: string): Promise<{ ok: true; token: string; config: string } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  try {
    const minted = await mintApiToken(member, name, dailyCapUsd);
    return { ok: true, ...minted };
  } catch (err) {
    return fail(err);
  }
}

export async function chooseTitleAction(projectId: string, title: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  try {
    await db.update(schema.projects).set({ title: title.slice(0, 120), lastTouchedBy: member.memberId, updatedAt: new Date() }).where(eq(schema.projects.id, projectId));
    revalidatePath(`/p/${projectId}/export`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
