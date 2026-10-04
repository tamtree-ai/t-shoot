"use server";

import { unsubscribe } from "@/services/studio/access";

/** A mail scanner that opens the link must not unsubscribe anyone, so the page asks, and this does it. */
export async function unsubscribeAction(rtoken: string): Promise<{ ok: boolean }> {
  return { ok: await unsubscribe(rtoken) };
}
