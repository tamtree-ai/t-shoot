"use server";

import { revalidatePath } from "next/cache";

import { getCurrentMember } from "@/lib/auth";
import { createReviewLink, revokeReviewLink, snapshot } from "@/services/versions";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export async function shareAction(projectId: string): Promise<Result<{ token: string }>> {
  try {
    await getCurrentMember();
    const version = await snapshot(projectId);
    const link = await createReviewLink(version.id);
    revalidatePath(`/p/${projectId}/review`);
    return { ok: true, data: { token: link.token } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function revokeAction(projectId: string, linkId: string): Promise<Result> {
  try {
    await getCurrentMember();
    await revokeReviewLink(linkId);
    revalidatePath(`/p/${projectId}/review`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
