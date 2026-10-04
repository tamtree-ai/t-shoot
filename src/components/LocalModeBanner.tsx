import { connection } from "next/server";

import { isLocalAuth } from "@/lib/standalone";

/**
 * Standalone mode with local sign-in: everyone who can open the app is the owner. Say so on
 * every page. Read at request time, so an image built without the variable still shows it.
 */
export async function LocalModeBanner() {
  await connection();
  if (!isLocalAuth()) return null;
  return (
    <div role="note" className="border-b border-rule bg-raised-2 px-4 py-1.5 text-center text-[12px] text-fg-3">
      Local mode: anyone on this computer can use it. Free: voiced and rendered on this computer.
    </div>
  );
}
