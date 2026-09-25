"use client";

import { useState } from "react";

import type { EditModel, SceneVM } from "@/services/edit-model";
import { elapsed, usd } from "./shared";

const label = "text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase";
const field = "box-border w-full resize-none rounded-lg border border-line bg-raised-2 px-3 py-2.5 leading-normal text-fg";
const ghostBtn = "flex h-8 items-center justify-center gap-[7px] rounded-lg border border-line bg-raised-2 text-[13px] font-medium text-fg";

export function Inspector(p: {
  scene: SceneVM;
  model: EditModel;
  onSaveNarration: (text: string) => void;
  onUndoNarration: () => void;
  onRerecord: () => void;
  onRefilm: (prompt: string) => void;
  onAsk: (preset?: string) => void;
  onFixCaption: (i: number, text: string | null) => void;
  onTrim: (start: number, end: number | null) => void;
  onMove: (dir: "up" | "down") => void;
  onDrop: () => void;
  onActivity: () => void;
  onCancel: (runId: string) => void;
  trimError: string | null;
}) {
  const { scene, model } = p;
  const [hear, setHear] = useState(scene.narration);
  const [see, setSee] = useState(scene.visualPrompt);
  const [editing, setEditing] = useState<number | null>(null);
  const [start, setStart] = useState(String(scene.trimStartS));
  const [end, setEnd] = useState(String(scene.trimEndS ?? scene.clipLengthS));
  const words = hear.trim().split(/\s+/).filter(Boolean).length;
  const filming = scene.clip.word === "Filming" ? elapsed(scene.clip.startedAt) : null;

  return (
    <aside aria-label={`Scene ${scene.position} details`} className="flex w-[352px] shrink-0 flex-col overflow-y-auto border-l border-rule bg-panel">
      <section className="flex flex-col gap-2.5 border-b border-rule px-4 py-3.5">
        <div className="flex items-center justify-between">
          <label htmlFor="hear" className={label}>What we hear</label>
          <span className="text-[11px] text-fg-muted">{words} words{scene.narrationDurationS ? <> · <span className="num">{scene.narrationDurationS.toFixed(1)}s</span></> : null}</span>
        </div>
        <textarea id="hear" rows={2} value={hear} onChange={(e) => setHear(e.target.value)} onBlur={() => hear.trim() && hear.trim() !== scene.narration && p.onSaveNarration(hear)} className={`${field} text-sm`} />
        {scene.voiceOutOfDate ? (
          <div role="status" className="flex items-center gap-2 rounded-lg border border-attention-line bg-attention-soft px-3 py-2 text-xs text-attention">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17.5v.01" /></svg>
            <span className="flex-1">Voice out of date</span>
            <button type="button" onClick={p.onUndoNarration} className="text-fg-3 underline">Undo</button>
            <button type="button" onClick={p.onRerecord} className="rounded-md border border-attention-line px-2 py-1 font-medium text-fg">Re-record <span className="num text-fg-3">~{usd(model.prices.narrate, 3)}</span></button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => p.onAsk("Reword this line")} className={ghostBtn}>Reword</button>
            <button type="button" onClick={() => p.onAsk("Shorten this line")} className={ghostBtn}>Shorten</button>
          </div>
        )}
        <span className="text-xs text-fg-muted">New words re-record the voice · <span className="num">~{usd(model.prices.narrate, 3)}</span>, after you confirm</span>
      </section>

      <section className="flex flex-col gap-2.5 border-b border-rule px-4 py-3.5">
        <label htmlFor="see" className={label}>What we see</label>
        <textarea id="see" rows={3} value={see} onChange={(e) => setSee(e.target.value)} className={`${field} text-[13px] text-fg-2`} />
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => p.onAsk()} className="text-xs text-accent-link">Ask for a change instead</button>
          <button type="button" onClick={() => p.onRefilm(see)} className="flex h-8 items-center gap-2 rounded-lg border border-line-strong bg-[#222227] px-3 text-[13px] font-medium">
            Refilm<span className="num text-[11px] text-fg-3">~{usd(model.prices.clip)}</span>
          </button>
        </div>
        {filming && scene.clip.runId && (
          <div className="flex items-center justify-between text-xs text-fg-3">
            <span>Filming · <span className="num">{filming}</span></span>
            <button type="button" onClick={() => p.onCancel(scene.clip.runId!)} className="text-fg-3 underline">Stop</button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-1.5 border-b border-rule px-4 py-3.5">
        <div className="mb-1 flex items-center justify-between">
          <h4 className={label}>Captions</h4>
          <span className="text-[11px] text-fg-muted">click to fix a word · free</span>
        </div>
        {scene.phrases.length === 0 && <span className="text-xs text-fg-muted">Captions appear once the voice is recorded.</span>}
        {scene.phrases.map((ph, i) => {
          const text = scene.captionOverrides[i] ?? ph.text;
          return editing === i ? (
            <input
              key={i}
              autoFocus
              defaultValue={text}
              aria-label={`Caption ${i + 1}`}
              onBlur={(e) => { setEditing(null); p.onFixCaption(i, e.target.value); }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(null); }}
              className="rounded-md border border-accent bg-raised-2 px-2 py-1.5 text-[13px]"
            />
          ) : (
            <button key={i} type="button" onClick={() => setEditing(i)} className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-[7px] text-left text-[13px] hover:bg-hover">
              <span className={`font-mono text-[11px] ${scene.captionOverrides[i] ? "text-accent" : "text-fg-muted"}`}>{i + 1}</span>
              <span>{text}</span>
              <span className="num text-[11px] text-fg-muted">{ph.start_s.toFixed(1)}s</span>
            </button>
          );
        })}
      </section>

      <section className="flex flex-col gap-2 border-b border-rule px-4 py-3.5">
        <div className="flex items-center justify-between">
          <h4 className={label}>Trim</h4>
          <span className="text-[11px] text-fg-muted">no shorter than the voice · <span className="num">{scene.floorS.toFixed(1)}s</span></span>
        </div>
        <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 text-[11px] text-fg-muted">
          <label className="flex flex-col gap-1">Start<input inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} className="num rounded-md border border-line bg-raised-2 px-2 py-1.5 text-[13px] text-fg" /></label>
          <label className="flex flex-col gap-1">End<input inputMode="decimal" value={end} onChange={(e) => setEnd(e.target.value)} className="num rounded-md border border-line bg-raised-2 px-2 py-1.5 text-[13px] text-fg" /></label>
          <button type="button" onClick={() => p.onTrim(Number(start) || 0, Number(end) || null)} className="h-[30px] rounded-md border border-line-strong bg-[#222227] px-3 text-xs font-medium text-fg">Apply</button>
        </div>
        {p.trimError && <span role="alert" className="text-xs text-attention">{p.trimError}</span>}
      </section>

      <section className="flex items-center gap-2 border-b border-rule px-4 py-3">
        <button type="button" onClick={() => p.onMove("up")} disabled={scene.position === 1} className={`${ghostBtn} flex-1 disabled:opacity-40`}>Earlier</button>
        <button type="button" onClick={() => p.onMove("down")} disabled={scene.position === model.scenes.length} className={`${ghostBtn} flex-1 disabled:opacity-40`}>Later</button>
        <button type="button" onClick={p.onDrop} disabled={model.scenes.length <= 1} className={`${ghostBtn} flex-1 disabled:opacity-40`}>Drop scene</button>
      </section>

      <section className="flex flex-col gap-2.5 px-4 py-3.5">
        <div className="flex items-center justify-between">
          <h4 className={label}>Behind the scenes</h4>
          <button type="button" onClick={p.onActivity} className="flex h-6 items-center gap-1.5 rounded-md px-2 text-xs text-fg-3">All activity<kbd className="rounded border border-line px-[5px] py-px font-mono text-[10px]">⌘’</kbd></button>
        </div>
        <div className="flex flex-col gap-1.5 text-xs leading-[1.45] text-fg-3">
          {scene.activity.length === 0 && <span>Nothing has run for this scene yet.</span>}
          {scene.activity.slice(0, 4).map((a) => (
            <div key={a.id} className="flex justify-between gap-2"><span>{a.text}</span><span className="num text-fg-2">{a.costUsd ? usd(a.costUsd, 3) : ""}</span></div>
          ))}
        </div>
      </section>
    </aside>
  );
}
