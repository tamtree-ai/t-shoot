"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { SCRIPT_PRICE_USD, type FilmingEstimate } from "@/lib/estimate";
import { approveScriptAction, reviseScriptAction } from "./actions";

export function EstimateAside({
  projectId,
  estimate,
  limitUsd,
  lastChange,
}: {
  projectId: string;
  estimate: FilmingEstimate;
  limitUsd: string;
  lastChange: { note: string; positions: number[] } | null;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [revising, startRevise] = useTransition();
  const [approving, startApprove] = useTransition();

  function rewrite() {
    setError(null);
    startRevise(async () => {
      const result = await reviseScriptAction(projectId, note);
      if (result.ok) setNote("");
      else setError(result.error);
    });
  }

  function approve() {
    setError(null);
    startApprove(async () => {
      const result = await approveScriptAction(projectId);
      if (result.ok) router.push(`/p/${projectId}/edit`);
      else setError(result.error);
    });
  }

  return (
    <aside
      aria-label="Cost to film"
      className="box-border flex w-[420px] shrink-0 flex-col gap-5 border-l border-rule-2 bg-panel-2 px-6 py-7"
    >
      <div className="flex flex-col gap-4 rounded-[14px] border border-raised-2 bg-raised-2 p-5">
        <span className="text-[13px] text-fg-3">Filming this script</span>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[34px] font-medium tracking-[-0.02em]">~${estimate.totalUsd.toFixed(2)}</span>
          <span className="text-[13px] text-fg-muted">about {estimate.minutes} minute{estimate.minutes === 1 ? "" : "s"}</span>
        </div>
        <div className="flex flex-col gap-2 text-[13px]">
          <div className="flex justify-between gap-3">
            <span className="text-fg-2">Film {estimate.toFilmCount} scene{estimate.toFilmCount === 1 ? "" : "s"}</span>
            <span className="font-mono text-fg-2">${estimate.filmCostUsd.toFixed(2)}</span>
          </div>
          {estimate.reusedCount > 0 && (
            <div className="flex justify-between gap-3">
              <span className="text-fg-2">
                {estimate.reusedCount} scene{estimate.reusedCount === 1 ? "" : "s"} filmed before, reused
              </span>
              <span className="text-fg-muted">no charge</span>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <span className="text-fg-2">Voice for {estimate.sceneCount} scenes</span>
            <span className="font-mono text-fg-2">${estimate.voiceCostUsd.toFixed(3)}</span>
          </div>
          <div className="h-px bg-raised-2" />
          <div className="flex justify-between gap-3">
            <span className="text-fg-3">Limit for this video</span>
            <span className="font-mono text-fg-2">${Number(limitUsd).toFixed(2)}</span>
          </div>
        </div>
        <button
          type="button"
          disabled={approving}
          onClick={approve}
          className="flex h-12 items-center justify-center gap-2.5 rounded-[10px] bg-accent text-[15px] font-semibold text-accent-ink disabled:opacity-60"
        >
          {approving ? "Starting filming…" : "Approve and start filming"}
          <span className="font-mono text-[13px] font-medium">~${estimate.totalUsd.toFixed(2)}</span>
        </button>
        <span className="text-xs leading-relaxed text-fg-muted">
          Nothing is spent until you approve. Each scene lands on the timeline as it&rsquo;s filmed, and you can keep editing
          the words as they do.
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        <label htmlFor="script-note" className="text-[13px] font-medium text-fg-2">
          Ask for a script change
        </label>
        <textarea
          id="script-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="For example: make the opening punchier, or use simpler words in scene 2"
          className="box-border w-full resize-none rounded-lg border border-line bg-canvas-script px-3 py-2.5 text-[13px] leading-normal text-fg placeholder:text-fg-muted"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-fg-muted">
            Rewrites the script · under <span className="font-mono">${SCRIPT_PRICE_USD.toFixed(2)}</span>
          </span>
          <button
            type="button"
            disabled={revising}
            onClick={rewrite}
            className="h-[34px] rounded-lg border border-line-strong bg-hover px-3.5 text-[13px] font-medium text-fg disabled:opacity-60"
          >
            {revising ? "Rewriting…" : "Rewrite"}
          </button>
        </div>
      </div>

      {lastChange && (
        <div className="flex flex-col gap-1.5 pt-1">
          <span className="text-xs text-fg-muted">Last change</span>
          <span className="text-[13px] leading-snug text-fg-2">
            &ldquo;{lastChange.note}&rdquo; changed scene{lastChange.positions.length === 1 ? "" : "s"}{" "}
            {lastChange.positions.join(", ")} · <span className="font-mono text-fg-muted">${SCRIPT_PRICE_USD.toFixed(3)}</span>
          </span>
        </div>
      )}

      {error && <p className="text-sm text-[#ff8a64]">{error}</p>}
    </aside>
  );
}
