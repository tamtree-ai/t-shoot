"use server";

import { revalidatePath } from "next/cache";

import { addComment, approveVersion } from "@/services/review";

type Result = { ok: true } | { ok: false; error: string };

export async function commentAction(token: string, authorName: string, timecodeS: number, body: string): Promise<Result> {
  try {
    await addComment(token, { authorName, timecodeS, body });
    revalidatePath(`/r/${token}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function approveAction(token: string, name: string): Promise<Result> {
  try {
    await approveVersion(token, name);
    revalidatePath(`/r/${token}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
