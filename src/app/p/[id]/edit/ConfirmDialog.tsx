"use client";

import { useEffect, useRef } from "react";

import { usd } from "./shared";

export type Confirm = {
  title: string;
  body: string;
  priceUsd: string;
  confirmLabel: string;
  /** "after" line: what the video's spend would become. */
  after?: string;
  run: () => void | Promise<void>;
};

/**
 * Every paid action shows its price before the click and needs this confirmation
 * (CLAUDE.md, 03 §2). Nothing calls a paid action without going through it.
 */
export function ConfirmDialog({ confirm, busy, error, onClose }: { confirm: Confirm; busy: boolean; error: string | null; onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="flex w-[420px] flex-col gap-4 rounded-[14px] border border-line bg-panel p-6 shadow-2xl">
        <h2 id="confirm-title" className="text-[17px] font-semibold tracking-[-0.01em]">{confirm.title}</h2>
        <p className="text-[13px] leading-relaxed text-fg-3">{confirm.body}</p>
        <div className="flex items-baseline justify-between rounded-lg border border-rule-2 bg-raised-2 px-4 py-3 text-[13px]">
          <span className="text-fg-3">This will cost about</span>
          <span className="num text-lg font-medium">~{usd(confirm.priceUsd, Number(confirm.priceUsd) < 0.1 ? 3 : 2)}</span>
        </div>
        {confirm.after && <p className="text-xs text-fg-muted">{confirm.after}</p>}
        {error && <p role="alert" className="text-[13px] text-attention">{error}</p>}
        <div className="flex gap-2.5">
          <button type="button" onClick={onClose} className="h-11 rounded-lg border border-line px-[18px] text-sm font-medium text-fg-2">Cancel</button>
          <button
            ref={ref}
            type="button"
            disabled={busy}
            onClick={() => confirm.run()}
            className="flex h-11 flex-1 items-center justify-center gap-2.5 rounded-lg bg-accent text-sm font-semibold text-accent-ink disabled:opacity-60"
          >
            {confirm.confirmLabel}
            <span className="num text-[13px] font-medium">~{usd(confirm.priceUsd, Number(confirm.priceUsd) < 0.1 ? 3 : 2)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
