"use server";

import { redirect } from "next/navigation";

import { getCurrentMember } from "@/lib/auth";
import { createProjectFromBrief, type NewBrief } from "@/services/projects";

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
