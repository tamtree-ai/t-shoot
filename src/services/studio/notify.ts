/** Email notifications (plan §4.5). Filled in by the notify job; the actions only ask for a send. */
import "server-only";

import { enqueueStudioNotify } from "@/lib/queue";

/** Decisions go out at once; comments wait for the digest sweep (5 minutes after the last one). */
export async function notifyOwnerSoon(shareId: string, opts: { immediate?: boolean } = {}): Promise<void> {
  if (!opts.immediate) return;
  try {
    await enqueueStudioNotify(shareId);
  } catch (e) {
    // A queue hiccup must not fail a client's approval. The next sweep still finds the event.
    console.error("[studio notify]", e);
  }
}
