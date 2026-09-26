"use server";

import { redirect } from "next/navigation";

import { getCurrentMember } from "@/lib/auth";
import { createProjectFromBrief, createStickSkitProject, type NewBrief, type NewStickBrief } from "@/services/projects";

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

/** A stick-skit brief: saved with its catalog pinned, no paid call; the skit is written next. */
export async function createStickProjectAction(input: NewStickBrief): Promise<CreateProjectResult | void> {
  const member = await getCurrentMember();
  let projectId: string;
  try {
    projectId = await createStickSkitProject(member.memberId, member.orgId, input);
  } catch (err) {
    const issues = (err as { issues?: { message: string }[] }).issues;
    return { ok: false, error: issues?.[0]?.message ?? (err instanceof Error ? err.message : "Something went wrong saving the brief.") };
  }
  redirect(`/p/${projectId}/script`);
}
