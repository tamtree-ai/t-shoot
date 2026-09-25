"use client";

import { useState } from "react";

import type { EditModel } from "@/services/edit-model";
import { clock, gradientFor, StateMark, usd } from "./shared";

const BASE_PPS = 28.8;

export function Timeline({ model, selectedId, globalT, onSelect }: { model: EditModel; selectedId: string; globalT: number; onSelect: (id: string) => void }) {
  const [zoom, setZoom] = useState(1);
  const pps = BASE_PPS * zoom;
  const total = model.totalLengthS;
  const width = Math.max(1, total * pps);
  const tickStep = zoom >= 1.5 ? 2 : 5;
  const ticks = Array.from({ length: Math.floor(total / tickStep) + 1 }, (_, i) => i * tickStep);
  const spent = Number(model.spentUsd) + 0;

  return (
    <section aria-label="Timeline" className="box-border h-[232px] shrink-0 bg-panel px-6 pb-3">
      <div className="flex h-11 items-center gap-3.5">
        <h2 className="text-[13px] font-semibold">Timeline</h2>
        <span className="num text-xs text-fg-3">{total.toFixed(1)}s · {usd(spent)}</span>
        <span className="text-xs text-fg-muted">Select a scene · trim in the panel on the right · captions follow the voice</span>
        <div className="flex-1" />
        <div className="flex gap-3 text-[11px] text-fg-3">
          <span className="flex items-center gap-[5px]"><span className="size-1.5 rounded-full bg-ready" />Ready</span>
          <span className="flex items-center gap-[5px]"><span className="size-1.5 rounded-full bg-accent" />Filming</span>
          <span className="flex items-center gap-[5px]"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f2c14e" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3l10 18H2z" /></svg>Needs you</span>
        </div>
        <div className="ml-2 flex gap-0.5">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="size-7 rounded-[7px] border border-line bg-raised text-sm text-fg-3">−</button>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className="size-7 rounded-[7px] border border-line bg-raised text-sm text-fg-3">+</button>
        </div>
      </div>

      <div className="flex overflow-x-auto">
        <div className="flex w-24 shrink-0 flex-col text-[11px] text-fg-muted">
          <div className="h-[22px]" />
          <div className="mt-1.5 flex h-16 items-center">Scenes</div>
          <div className="mt-1.5 flex h-6 items-center">Captions</div>
          <div className="mt-1.5 flex h-9 items-center">Voice</div>
        </div>

        <div className="relative shrink-0" style={{ width }}>
          <div className="relative h-[22px] border-b border-rule-2">
            {ticks.map((s) => (
              <span key={s} className="absolute top-[3px] font-mono text-[10px] text-fg-muted" style={{ left: s * pps }}>{clock(s).replace(/\.0$/, "")}</span>
            ))}
          </div>

          <div className="mt-1.5 flex h-16 gap-0.5">
            {model.scenes.map((s) => {
              const failed = s.state.dot === "amber";
              const filming = s.state.dot === "accent";
              const selected = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-current={selected || undefined}
                  onClick={() => onSelect(s.id)}
                  className="flex shrink-0 flex-col justify-between overflow-hidden rounded-md px-2 py-1.5 text-left text-[11px]"
                  style={{
                    width: s.lengthS * pps - 2,
                    background: failed ? "transparent" : filming ? "repeating-linear-gradient(135deg, #1c1c20 0px, #1c1c20 6px, #24242a 6px, #24242a 12px)" : gradientFor(s.position),
                    border: failed ? "1px dashed #8a7433" : undefined,
                    boxShadow: selected ? "inset 0 0 0 2px var(--color-accent)" : undefined,
                    color: failed ? "var(--color-attention)" : "rgba(255,255,255,0.88)",
                  }}
                >
                  <span className="truncate">{String(s.position).padStart(2, "0")} {s.title}</span>
                  {s.state.dot === "green" ? (
                    <span className="num truncate text-[10px] text-white/60">{s.clip.reused ? "reused · no charge" : usd(s.costUsd)}</span>
                  ) : (
                    <StateMark state={s.state} suffix={s.state.animated && s.clip.startedAt ? undefined : undefined} />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-1.5 flex h-6 gap-0.5">
            {model.scenes.map((s) => {
              const phrases = s.phrases.length ? s.phrases : [];
              const totalDur = phrases.reduce((n, p) => n + (p.end_s - p.start_s), 0) || 1;
              return (
                <div key={s.id} className="flex shrink-0 gap-[3px]" style={{ width: s.lengthS * pps - 2 }}>
                  {phrases.map((p, i) => (
                    <div key={i} className="h-6 min-w-0 truncate rounded-[5px] px-[7px] text-[10px] leading-6" style={{ flexGrow: (p.end_s - p.start_s) / totalDur, background: "#222227", color: "var(--color-fg-2)" }}>
                      {s.captionOverrides[i] ?? p.text}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <div className="mt-1.5 flex h-9 items-center gap-0.5" aria-hidden>
            {model.scenes.map((s) => (
              <div key={s.id} className="flex shrink-0 items-center gap-[3px] overflow-hidden" style={{ width: s.lengthS * pps - 2 }}>
                {s.narrationDurationS
                  ? Array.from({ length: Math.floor((Math.min(s.narrationDurationS, s.lengthS) * pps) / 6) }, (_, i) => (
                      <div key={i} className="w-[3px] shrink-0 rounded-sm bg-[#3a3a42]" style={{ height: 5 + Math.abs(Math.sin((i + s.position * 7) * 0.53) * Math.cos(i * 0.17)) * 22 }} />
                    ))
                  : null}
              </div>
            ))}
          </div>

          <div className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-accent" style={{ left: Math.min(width, globalT * pps) }}>
            <div className="absolute -top-0.5 -left-[5px] h-2.5 w-3 rounded-[3px] bg-accent" />
          </div>
        </div>
      </div>
    </section>
  );
}
