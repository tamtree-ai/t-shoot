"use server";

import { redirect } from "next/navigation";

import { getCurrentMember } from "@/lib/auth";
import { createProjectFromBrief, createStickSkitProject, type NewBrief, type NewStickBrief } from "@/services/projects";
import { writeSkit } from "@/services/skit";

export type CreateProjectResult = { ok: false; error: string };

/**
 * Returns an error result on failure; redirects on success. `redirect()` throws a
 * special value the framework relies on, so it must never be inside the try/catch
 * below — only `createProjectFromBrief`'s own failures are meant to be caught.
 */
export async function createProjectAction(input: NewBrief): Promise<CreateProjectResult | void> {
  const member = await getCurrentMember();
  let projectId: string;
  try {
    projectId = await createProjectFromBrief(member.memberId, member.orgId, input);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong writing the script." };
  }
  redirect(`/p/${projectId}/script`);
}

/**
 * A stick-skit brief: saved with its catalog pinned, then the skit is written (`stick-script`,
 * ~$0.01). A failed write still lands on the Script step, which offers to write it again.
 */
export async function createStickProjectAction(input: NewStickBrief & { showId?: string; episodeNumber?: number }): Promise<CreateProjectResult | void> {
  const member = await getCurrentMember();
  let projectId: string;
  try {
    const { showId, episodeNumber, ...brief } = input;
    projectId = await createStickSkitProject(member.memberId, member.orgId, brief, { showId, episodeNumber });
  } catch (err) {
    const issues = (err as { issues?: { message: string }[] }).issues;
    return { ok: false, error: issues?.[0]?.message ?? (err instanceof Error ? err.message : "Something went wrong saving the brief.") };
  }
  await writeSkit(projectId, member.memberId).catch(() => undefined);
  redirect(`/p/${projectId}/script`);
}
