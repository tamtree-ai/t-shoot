"use client";

import { useState, useTransition } from "react";

import { moveToCurrentCatalogAction } from "./actions";

/**
 * A project written against an older Stick Stage catalog: nothing can run until it moves to
 * the one t-shoot ships. Moving is free. Once moved, this notice is gone and the skit's own
 * check shows anything the new catalog no longer has.
 */
export function CatalogNotice({ projectId }: { projectId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [moving, startMove] = useTransition();

  function move() {
    setError(null);
    startMove(async () => {
      const result = await moveToCurrentCatalogAction(projectId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div role="status" className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-attention-line bg-attention-soft px-4 py-2.5 text-[13px]">
      <p className="text-fg">This skit was written against an older set of characters, sets and props. Move it to the current one to keep working.</p>
      <button
        type="button"
        disabled={moving}
        onClick={move}
        className="flex h-8 items-center rounded-[8px] bg-accent px-3 text-[13px] font-semibold text-accent-ink disabled:opacity-60"
      >
        {moving ? "Moving…" : "Move to current catalog"}
      </button>
      {error && <p role="alert" className="text-attention">{error}</p>}
    </div>
  );
}
