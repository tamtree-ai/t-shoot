"use server";

import { revalidatePath } from "next/cache";

import { getCurrentMember } from "@/lib/auth";
import { dismissComment } from "@/services/review";
import { createReviewLink, revokeReviewLink, versionToShare } from "@/services/versions";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export async function shareAction(projectId: string): Promise<Result<{ token: string }>> {
  try {
    await getCurrentMember();
    const version = await versionToShare(projectId);
    const link = await createReviewLink(version.id);
    revalidatePath(`/p/${projectId}/review`);
    return { ok: true, data: { token: link.token } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function dismissCommentAction(projectId: string, commentId: string): Promise<Result> {
  try {
    await getCurrentMember();
    await dismissComment(projectId, commentId);
    revalidatePath(`/p/${projectId}/review`);
    revalidatePath("/");
    return { ok: true };
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
