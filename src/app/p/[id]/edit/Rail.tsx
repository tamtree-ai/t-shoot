"use client";

import { BRIEF_VOICES } from "@/lib/brief-options";
import type { EditModel, SceneVM } from "@/services/edit-model";
import { gradientFor, usd } from "./shared";

export function Rail({ scene, model, onChooseTake, onNewTake, onPickVoice }: {
  scene: SceneVM;
  model: EditModel;
  onChooseTake: (takeId: string) => void;
  onNewTake: () => void;
  onPickVoice: (voiceId: string) => void;
}) {
  const heading = "text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase";
  return (
    <aside aria-label={`Assets for scene ${scene.position}`} className="flex w-[264px] shrink-0 flex-col border-r border-rule bg-panel">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-rule px-4">
        <span className={heading}>Scene assets</span>
        <span className="flex h-5 items-center rounded-full bg-accent-soft px-2 text-[11px] font-medium text-accent">Scene {scene.position} / {model.scenes.length}</span>
      </div>

      <section className="flex flex-col gap-2.5 border-b border-rule p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[13px] font-semibold">Clip takes</h3>
          <span className="text-[11px] text-fg-muted">{scene.takes.length} take{scene.takes.length === 1 ? "" : "s"}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {scene.takes.map((t) => {
            const inUse = t.id === scene.chosenTakeId;
            return (
              <button
                key={t.id}
                type="button"
                disabled={!t.ready}
                aria-pressed={inUse}
                aria-label={`Take ${t.number}${inUse ? ", in use" : ""}${t.ready ? "" : ", not filmed yet"}`}
                onClick={() => onChooseTake(t.id)}
                className="relative h-32 overflow-hidden rounded-md border p-0 disabled:opacity-50"
                style={{ background: gradientFor(scene.position + t.number), borderColor: inUse ? "var(--color-accent)" : "var(--color-rule)", boxShadow: inUse ? "0 0 0 1px var(--color-accent)" : undefined }}
              >
                <span className="absolute top-1 left-1 rounded-full bg-black/60 px-[5px] py-0.5 text-[9px] font-semibold tracking-[0.05em] text-fg">TAKE {t.number}</span>
                {!t.ready && <span className="absolute inset-x-0 bottom-1 text-center text-[10px] text-fg-3">Filming…</span>}
              </button>
            );
          })}
          <button type="button" onClick={onNewTake} className="flex h-32 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong text-[11px] text-fg-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
            New take
            <span className="num text-[10px] text-fg-muted">~{usd(model.prices.clip)}</span>
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[13px] font-semibold">Voice</h3>
          <span className="text-[11px] text-fg-muted">change ~{usd(model.prices.narrate, 3)} a scene</span>
        </div>
        <div className="flex flex-col gap-1" role="radiogroup" aria-label="Voice">
          {BRIEF_VOICES.map((v) => {
            const inUse = v.id === model.project.voice;
            return (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={inUse}
                onClick={() => !inUse && onPickVoice(v.id)}
                className="flex items-center gap-2.5 rounded-md p-2 text-left"
                style={{ background: inUse ? "var(--color-raised-2)" : undefined, boxShadow: inUse ? "inset 0 0 0 1px var(--color-accent)" : undefined }}
              >
                <span className={`flex size-[26px] shrink-0 items-center justify-center rounded-full ${inUse ? "bg-accent text-accent-ink" : "border border-line-strong text-fg-2"}`} aria-hidden>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z" /></svg>
                </span>
                <span className="flex min-w-0 flex-col"><span className="text-[13px] font-medium">{v.name}</span><span className="text-[11px] text-fg-muted">{v.desc}</span></span>
                {inUse && <span className="ml-auto text-[11px] text-accent">In use</span>}
              </button>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
