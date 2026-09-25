"use client";

import { useTransition } from "react";

import type { Scene } from "@/db/schema";
import { addSceneAction } from "./actions";
import { SceneRow } from "./SceneRow";

export function Screenplay({
  projectId,
  scenes,
  voiceLabel,
  totalSeconds,
}: {
  projectId: string;
  scenes: Scene[];
  voiceLabel: string;
  totalSeconds: number;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <main className="flex flex-grow flex-col gap-[18px] overflow-hidden px-10 py-7 pb-6">
      <div className="flex items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[22px] font-semibold tracking-[-0.015em]">Read it through before we film</h1>
          <span className="text-[13px] text-fg-muted">
            {scenes.length} scenes · about {totalSeconds} seconds · voice {voiceLabel}. Editing is free: click any line to
            change it.
          </span>
        </div>
        <div className="flex-grow" />
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => void addSceneAction(projectId))}
          className="flex h-[34px] items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-fg-2 disabled:opacity-60"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add scene
        </button>
      </div>

      <div className="grid grid-cols-[56px_minmax(0,1fr)_minmax(0,1fr)_88px] gap-x-5 border-b border-rule-2 pb-2 text-[11px] font-medium tracking-[0.08em] text-fg-muted uppercase">
        <span>Scene</span>
        <span>What we hear</span>
        <span>What we see</span>
        <span className="text-right">Length</span>
      </div>

      <div className="flex flex-col overflow-y-auto">
        {scenes.map((scene, i) => (
          <SceneRow key={scene.id} projectId={projectId} scene={scene} isFirst={i === 0} isLast={i === scenes.length - 1} />
        ))}
      </div>
    </main>
  );
}
