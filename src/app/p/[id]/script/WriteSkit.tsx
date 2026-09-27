"use client";

import { useState, useTransition } from "react";

import { STICK_SCRIPT_PRICE_USD } from "@/lib/estimate";
import { writeSkitAction } from "./actions";

/** A saved brief with no skit yet: the brief's own write failed, or was never asked for. */
export function WriteSkit({ projectId, topic }: { projectId: string; topic: string }) {
  const [error, setError] = useState<string | null>(null);
  const [writing, startWrite] = useTransition();

  function write() {
    setError(null);
    startWrite(async () => {
      const result = await writeSkitAction(projectId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <main className="flex flex-1 justify-center bg-canvas-script px-4">
      <div className="flex w-[640px] flex-col items-start gap-5 py-16">
        <h1 className="font-display text-[40px] leading-[1.05] tracking-[-0.01em]">{topic}</h1>
        <p className="text-[15px] leading-relaxed text-fg-2">The brief is saved. Nothing else has been spent.</p>
        <button
          type="button"
          disabled={writing}
          onClick={write}
          className="flex h-12 items-center gap-2.5 rounded-[10px] bg-accent px-5 text-[15px] font-semibold text-accent-ink disabled:opacity-60"
        >
          {writing ? "Writing the skit…" : "Write the skit"}
          <span className="font-mono text-[13px] font-medium">up to ${STICK_SCRIPT_PRICE_USD.toFixed(2)}</span>
        </button>
        {error && (
          <p role="alert" className="text-[13px] text-attention">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
