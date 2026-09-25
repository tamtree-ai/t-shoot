"use client";

import { useEffect } from "react";

import type { EditModel } from "@/services/edit-model";
import { usd } from "./shared";

/** All activity (⌘’): Needs you first, then the feed, then the cost card; technical details folded. */
export function ActivityDrawer({ model, onClose, onSelect }: { model: EditModel; onClose: () => void; onSelect: (id: string) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const needs = model.scenes.filter((s) => s.state.dot === "amber");
  const feed = model.scenes
    .flatMap((s) => s.activity.map((a) => ({ ...a, scene: s })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 30);
  const limit = Number(model.project.limitUsd);
  const spent = Number(model.spentUsd);
  const onWay = Number(model.inflightUsd);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="activity-title" className="box-border flex h-full w-[440px] flex-col overflow-y-auto border-l border-line bg-[#141417] p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="activity-title" className="text-[17px] font-semibold tracking-[-0.01em]">All activity</h2>
          <button type="button" onClick={onClose} aria-label="Close (Esc)" className="flex size-9 items-center justify-center rounded-lg border border-line text-fg-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Needs you</h3>
        {needs.length === 0 ? <p className="mb-5 text-[13px] text-fg-3">Nothing needs you right now.</p> : (
          <ul className="mb-5 flex flex-col gap-1.5">
            {needs.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => { onSelect(s.id); onClose(); }} className="flex w-full items-center gap-2 rounded-lg border border-attention-line bg-attention-soft px-3 py-2 text-left text-[13px] text-fg-2">
                  <span className="font-mono text-attention">{String(s.position).padStart(2, "0")}</span>{s.title}<span className="ml-auto text-xs text-fg-3">{s.state.word}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Activity</h3>
        <ul className="mb-5 flex flex-col gap-1">
          {feed.length === 0 && <li className="text-[13px] text-fg-3">Nothing has run yet.</li>}
          {feed.map((a) => (
            <li key={a.id} className="rounded-md px-2 py-1.5 text-[13px]">
              <div className="flex justify-between gap-2"><span className="text-fg-2"><span className="font-mono text-[11px] text-fg-muted">{String(a.scene.position).padStart(2, "0")}</span> {a.text}</span><span className="num text-fg-3">{a.costUsd ? usd(a.costUsd, 3) : ""}</span></div>
              <details className="mt-1 text-[11px] text-fg-muted"><summary className="cursor-pointer">Technical details</summary><div className="mt-1 font-mono">{a.stage} · {a.tamtreeRunId ?? "not started"}</div></details>
            </li>
          ))}
        </ul>

        <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">This video</h3>
        <div className="flex flex-col gap-2 rounded-xl border border-rule-2 bg-raised-2 p-4 text-[13px]">
          <div className="flex justify-between"><span className="text-fg-3">Spent</span><span className="num">{usd(spent)}</span></div>
          <div className="flex justify-between"><span className="text-fg-3">On the way</span><span className="num">~{usd(onWay)}</span></div>
          <div className="flex justify-between"><span className="text-fg-3">Limit</span><span className="num">{usd(limit)}</span></div>
        </div>
      </section>
    </div>
  );
}
