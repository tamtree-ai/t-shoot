"use client";

import type { StudioState } from "@/lib/run-state";

export const usd = (v: string | number, digits = 2) => `$${Number(v).toFixed(digits)}`;

export function clock(s: number): string {
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(1).padStart(4, "0")}`;
}

export function elapsed(iso?: string): string {
  if (!iso) return "";
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

/** Status is a dot plus a word, never colour alone (03 §3). Amber carries a triangle. */
export function StateMark({ state, suffix }: { state: StudioState; suffix?: string }) {
  const colour = { grey: "#5c5c66", accent: "var(--color-accent)", green: "var(--color-ready)", amber: "var(--color-attention)" }[state.dot];
  return (
    <span className="flex items-center gap-1.5 text-xs text-fg-3">
      {state.triangle ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={colour} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3l10 18H2z" />
          <path d="M12 10v4M12 17.5v.01" />
        </svg>
      ) : (
        <span aria-hidden className={`size-1.5 rounded-full ${state.animated ? "animate-filming" : ""}`} style={{ background: colour }} />
      )}
      {state.word}
      {suffix ? <span className="num text-fg-muted">{suffix}</span> : null}
    </span>
  );
}

export const SCENE_GRADIENTS = [
  "linear-gradient(160deg, #1b4058 0%, #0a1c28 100%)",
  "linear-gradient(160deg, #6a3526 0%, #26140f 100%)",
  "linear-gradient(160deg, #4a2e5a 0%, #1e1226 100%)",
  "linear-gradient(160deg, #1d5e56 0%, #0a2522 100%)",
  "linear-gradient(160deg, #573468 0%, #1e1226 100%)",
  "linear-gradient(160deg, #3a4a1c 0%, #131a0a 100%)",
];
export const gradientFor = (position: number) => SCENE_GRADIENTS[(position - 1) % SCENE_GRADIENTS.length];

export function Spinner() {
  return <span aria-hidden className="inline-block size-3 animate-spin rounded-full border-2 border-fg-muted border-t-transparent" />;
}
