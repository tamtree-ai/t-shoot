"use server";

import { revalidatePath } from "next/cache";

import { getCurrentMember } from "@/lib/auth";
import { archiveProject, deleteProject, duplicateProject, renameProject } from "@/services/library";
import { getProject } from "@/services/projects";
import { briefFromShow, getShow, saveShow, variationPriceUsd, writeVariations, type ShowConfig } from "@/services/shows";
import { stickSkit } from "@/types/stick-skit";

type Result = { ok: true; id?: string } | { ok: false; error: string };

function fail(err: unknown, fallback: string): Result {
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

export async function renameProjectAction(projectId: string, title: string): Promise<Result> {
  try {
    const member = await getCurrentMember();
    await renameProject(member.orgId, projectId, title);
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return fail(err, "The name was not saved.");
  }
}

export async function duplicateProjectAction(projectId: string): Promise<Result> {
  try {
    const member = await getCurrentMember();
    const id = await duplicateProject(member.orgId, member.memberId, projectId);
    revalidatePath("/");
    return { ok: true, id };
  } catch (err) {
    return fail(err, "The copy was not made.");
  }
}

export async function archiveProjectAction(projectId: string, archived: boolean): Promise<Result> {
  try {
    const member = await getCurrentMember();
    await archiveProject(member.orgId, projectId, archived);
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return fail(err, "That project was not updated.");
  }
}

export async function deleteProjectAction(projectId: string): Promise<Result> {
  try {
    const member = await getCurrentMember();
    await deleteProject(member.orgId, projectId);
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return fail(err, "That project was not deleted.");
  }
}

export async function saveShowAction(input: ShowConfig, showId?: string): Promise<Result> {
  try {
    const member = await getCurrentMember();
    const id = await saveShow(member.orgId, input, showId);
    revalidatePath("/");
    return { ok: true, id };
  } catch (err) {
    return fail(err, "The show was not saved.");
  }
}

export async function variationsAction(projectId: string): Promise<Result> {
  try {
    const member = await getCurrentMember();
    const project = await getProject(projectId);
    if (!project || project.orgId !== member.orgId || project.kind !== stickSkit.kind) return { ok: false, error: "Variations are for stick-figure skits." };
    const brief = stickSkit.configSchema.parse(project.brief);
    await writeVariations(member.orgId, member.memberId, { topic: brief.topic, brief, limitUsd: project.limitUsd ?? "1.00", showId: project.showId ?? undefined });
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return fail(err, "The variations were not written.");
  }
}

export async function showVariationsAction(showId: string, topic: string): Promise<Result> {
  try {
    const member = await getCurrentMember();
    const show = await getShow(member.orgId, showId);
    if (!show) return { ok: false, error: "That show is not in this workspace." };
    const brief = briefFromShow(show.config, topic.trim() || show.name);
    await writeVariations(member.orgId, member.memberId, { topic: brief.topic, brief, limitUsd: brief.limitUsd, showId });
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return fail(err, "The variations were not written.");
  }
}

export async function variationPriceAction(): Promise<number> {
  return variationPriceUsd();
}
