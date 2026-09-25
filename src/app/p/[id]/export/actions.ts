"use server";

import { revalidatePath } from "next/cache";

import { getCurrentMember } from "@/lib/auth";
import { requestFinalRender } from "@/services/export";

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
