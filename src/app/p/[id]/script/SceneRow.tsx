"use client";

import { useState, useTransition } from "react";

import type { Scene } from "@/db/schema";
import { estimateNarrationSeconds } from "@/lib/narration";
import { dropSceneAction, keepSceneChangeAction, moveSceneAction, undoSceneChangeAction, updateSceneTextAction } from "./actions";

const textareaBase = "box-border w-full resize-none border-none bg-transparent leading-normal";

export function SceneRow({
  projectId,
  scene,
  isFirst,
  isLast,
}: {
  projectId: string;
  scene: Scene;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [narration, setNarration] = useState(scene.narration);
  const [visualPrompt, setVisualPrompt] = useState(scene.visualPrompt);
  const [pending, startTransition] = useTransition();
  const changed = Boolean(scene.revisionNote);

  function saveField(field: "narration" | "visualPrompt", value: string) {
    const original = field === "narration" ? scene.narration : scene.visualPrompt;
    if (value === original) return;
    startTransition(() => {
      void updateSceneTextAction(projectId, scene.id, field, value);
    });
  }

  return (
    <div
      className={`grid grid-cols-[56px_minmax(0,1fr)_minmax(0,1fr)_88px] items-start gap-x-5 py-3.5 ${
        isLast ? "" : "border-b border-[#1c1c20]"
      } ${changed ? "rounded-lg border-none bg-changed-bg" : ""} ${pending ? "opacity-70" : ""}`}
    >
      <div className="flex flex-col gap-1.5 pt-1.5 pl-2">
        <span className={`font-mono text-xs ${changed ? "text-accent" : "text-fg-muted"}`}>
          {String(scene.position).padStart(2, "0")}
        </span>
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            aria-label="Move scene up"
            disabled={isFirst}
            onClick={() => startTransition(() => void moveSceneAction(projectId, scene.id, "up"))}
            className="text-fg-muted hover:text-fg-2 disabled:opacity-20"
          >
            ▲
          </button>
          <button
            type="button"
            aria-label="Move scene down"
            disabled={isLast}
            onClick={() => startTransition(() => void moveSceneAction(projectId, scene.id, "down"))}
            className="text-fg-muted hover:text-fg-2 disabled:opacity-20"
          >
            ▼
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <textarea
          aria-label={`Scene ${scene.position}, what we hear`}
          rows={2}
          value={narration}
          onChange={(e) => setNarration(e.target.value)}
          onBlur={(e) => saveField("narration", e.target.value)}
          className={`${textareaBase} font-display text-[21px] text-fg`}
        />
        {changed && (
          <div className="flex items-center gap-2">
            <span className="flex h-[22px] items-center rounded bg-[var(--color-changed-pill-bg)] px-2 text-[11px] font-medium text-[var(--color-changed-pill-fg)]">
              Changed by your note
            </span>
            <button
              type="button"
              onClick={() => startTransition(() => void keepSceneChangeAction(projectId, scene.id))}
              className="h-7 rounded-md border border-line bg-hover px-2.5 text-xs text-fg"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={() => startTransition(() => void undoSceneChangeAction(projectId, scene.id))}
              className="h-7 rounded-md border-none bg-transparent px-2.5 text-xs text-fg-3"
            >
              Undo
            </button>
          </div>
        )}
      </div>

      <textarea
        aria-label={`Scene ${scene.position}, what we see`}
        rows={changed ? 3 : 2}
        value={visualPrompt}
        onChange={(e) => setVisualPrompt(e.target.value)}
        onBlur={(e) => saveField("visualPrompt", e.target.value)}
        className={`${textareaBase} pt-0.5 text-[13px] text-fg-3`}
      />

      <div className="flex flex-col items-end gap-1 pt-1.5 pr-2">
        <span className="font-mono text-xs text-fg-muted">{estimateNarrationSeconds(narration).toFixed(1)}s</span>
        <button
          type="button"
          aria-label={`Drop scene ${scene.position}`}
          onClick={() => startTransition(() => void dropSceneAction(projectId, scene.id))}
          className="text-fg-muted hover:text-[#ff8a64]"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-8 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
