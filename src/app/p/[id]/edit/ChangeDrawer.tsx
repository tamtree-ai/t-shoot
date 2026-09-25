"use client";

import { useEffect, useState, useTransition } from "react";

import type { ChangePlan } from "@/services/change";
import type { SceneVM } from "@/services/edit-model";
import { confirmChangeAction, planChangeAction } from "./actions";
import { gradientFor, Spinner, usd } from "./shared";

const CHIPS = ["Darker", "Slower", "Closer shot", "Shorter line", "Different wording"];

/** "Ask for a change" (Direct.dc.html): a note → a priced plan → one confirmation. */
export function ChangeDrawer({ projectId, scene, preset, onClose, onDone }: { projectId: string; scene: SceneVM; preset?: string; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState(preset ?? "");
  const [plan, setPlan] = useState<ChangePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, startWork] = useTransition();
  const [applying, startApply] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (chip: string) => setNote((n) => (n.toLowerCase().includes(chip.toLowerCase()) ? n : `${n.trim()}${n.trim() ? ". " : ""}${chip}`));

  function work() {
    setError(null);
    startWork(async () => {
      const r = await planChangeAction(projectId, scene.id, note);
      if (r.ok) setPlan(r.data);
      else setError(r.error);
    });
  }
  function apply() {
    if (!plan) return;
    setError(null);
    startApply(async () => {
      const r = await confirmChangeAction(projectId, plan.changeId);
      if (r.ok) onDone();
      else setError(r.guard === "project_limit" ? "This would take the video past its limit." : r.error);
    });
  }

  const paid = plan ? Number(plan.totalUsd) > 0 : false;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="direct-title" className="box-border flex h-full w-[480px] flex-col overflow-hidden border-l border-line bg-[#141417] shadow-[-30px_0_80px_-20px_rgba(0,0,0,0.7)]">
        <div className="flex shrink-0 items-start gap-3 border-b border-rule-2 px-6 pt-5 pb-4">
          <div className="h-[60px] w-[34px] shrink-0 rounded-[5px]" style={{ background: gradientFor(scene.position) }} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id="direct-title" className="text-[17px] font-semibold tracking-[-0.01em]">Ask for a change</h2>
            <span className="text-[13px] text-fg-3"><span className="font-mono text-accent">{String(scene.position).padStart(2, "0")}</span> {scene.title} · take {scene.takes.find((t) => t.id === scene.chosenTakeId)?.number ?? 1}</span>
          </div>
          <button type="button" aria-label="Close (Esc)" onClick={onClose} className="flex size-9 items-center justify-center rounded-lg border border-line text-fg-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-[22px] overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="change-note" className="text-[13px] font-medium text-fg-2">What should change?</label>
            <textarea id="change-note" rows={3} value={note} onChange={(e) => { setNote(e.target.value); setPlan(null); }} className="box-border w-full resize-none rounded-lg border border-accent bg-canvas-script px-3 py-[11px] text-sm leading-normal text-fg" />
            <div role="group" aria-label="Suggestions" className="flex flex-wrap gap-1.5">
              {CHIPS.map((c) => {
                const on = note.toLowerCase().includes(c.toLowerCase());
                return <button key={c} type="button" aria-pressed={on} onClick={() => { toggle(c); setPlan(null); }} className={`h-[30px] rounded-full border px-[11px] text-xs ${on ? "border-[#5a3a2e] bg-[#2a1c17] text-[#f4c3b0]" : "border-line text-fg-3"}`}>{c}</button>;
              })}
            </div>
          </div>

          {plan && (
            <>
              <div className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-[13px] font-medium text-fg-2">Here’s what we’ll do</h3>
                  <span className="text-[11px] text-fg-muted">worked out for <span className="font-mono">$0.003</span></span>
                </div>
                <div className="flex flex-col rounded-xl border border-[#26262b] bg-raised-2">
                  {plan.actions.map((a, i) => (
                    <div key={a.kind} className={`flex items-center gap-3 px-3.5 py-3 ${i > 0 ? "" : "border-b border-rule-2"}`}>
                      <div className="flex flex-1 flex-col gap-0.5"><span className="text-[13px] font-medium">{a.label}</span><span className="text-xs text-fg-muted">{a.detail}</span></div>
                      {Number(a.costUsd) > 0 ? <span className="num text-[13px]">~{usd(a.costUsd, Number(a.costUsd) < 0.1 ? 3 : 2)}</span> : <span className="text-xs text-fg-muted">no charge</span>}
                    </div>
                  ))}
                </div>
              </div>
              {(plan.changed.visual_prompt || plan.changed.narration) ? (
                <div className="flex flex-col gap-2 rounded-xl border border-rule-2 bg-panel p-3.5">
                  <span className="text-[11px] font-medium tracking-[0.08em] text-fg-muted uppercase">{plan.changed.visual_prompt ? "What we see" : "What we hear"}</span>
                  <p className="text-[13px] leading-normal text-fg-muted line-through decoration-[#5c5c66]">{plan.changed.visual_prompt ? plan.before.visualPrompt : plan.before.narration}</p>
                  <p className="text-[13px] leading-normal text-fg">{plan.changed.visual_prompt ? plan.after.visualPrompt : plan.after.narration}</p>
                </div>
              ) : (
                <p className="text-[13px] text-fg-3">That note didn’t change the scene. Try saying what you’d like to see or hear differently.</p>
              )}
              <span className="text-xs text-fg-3">Earlier takes stay. You can switch back at any time.</span>
            </>
          )}
          {error && <p role="alert" className="text-[13px] text-attention">{error}</p>}
        </div>

        <div className="flex shrink-0 flex-col gap-3.5 border-t border-rule-2 px-6 pt-4 pb-5">
          {plan && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-fg-3">This video after the change</span>
              <span className="font-mono text-fg-2">~{usd(plan.projectedUsd)} <span className="text-fg-muted">of {usd(plan.limitUsd)}</span></span>
            </div>
          )}
          <div className="flex gap-2.5">
            <button type="button" onClick={onClose} className="h-11 rounded-lg border border-line px-[18px] text-sm font-medium text-fg-2">Cancel</button>
            {!plan ? (
              <button type="button" disabled={!note.trim() || working} onClick={work} className="flex h-11 flex-1 items-center justify-center gap-2.5 rounded-lg bg-accent text-sm font-semibold text-accent-ink disabled:opacity-50">
                {working && <Spinner />}Work out the change<span className="num text-[13px] font-medium">~$0.003</span>
              </button>
            ) : (
              <button type="button" disabled={applying || (!plan.changed.narration && !plan.changed.visual_prompt)} onClick={apply} className="flex h-11 flex-1 items-center justify-center gap-2.5 rounded-lg bg-accent text-sm font-semibold text-accent-ink disabled:opacity-50">
                {applying && <Spinner />}{plan.changed.visual_prompt ? "Refilm scene" : "Apply change"}
                {paid && <span className="num text-[13px] font-medium">~{usd(plan.totalUsd, Number(plan.totalUsd) < 0.1 ? 3 : 2)}</span>}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
