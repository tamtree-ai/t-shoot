"use client";

import { useState } from "react";

import { SFX_CHOICES, sfxLabel, stingForSlam } from "@/lib/sfx-catalog";

export function SfxChip({
  value,
  slam,
  label,
  onChange,
}: {
  value: string | null;
  slam?: string;
  label: string;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const suggestion = slam ? stingForSlam(slam) : null;
  return (
    <span className="relative">
      <button type="button" aria-label={label} onClick={() => setOpen((v) => !v)} className="h-7 rounded-full border border-line px-2.5 text-xs text-fg-2 hover:bg-hover">
        {sfxLabel(value)}
      </button>
      {open && (
        <ul className="absolute z-20 mt-1 max-h-64 w-52 overflow-auto rounded-lg border border-line bg-raised p-1 shadow-lg">
          <li>
            <button type="button" className="w-full rounded px-2 py-1.5 text-left text-[13px] hover:bg-hover" onClick={() => { onChange(null); setOpen(false); }}>None</button>
          </li>
          {suggestion && (
            <li>
              <button type="button" className="w-full rounded px-2 py-1.5 text-left text-[13px] text-accent-link hover:bg-hover" onClick={() => { onChange(suggestion); setOpen(false); }}>
                Suggested · {sfxLabel(suggestion)}
              </button>
            </li>
          )}
          {SFX_CHOICES.map((sfx) => (
            <li key={sfx.id}>
              <button type="button" className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[13px] hover:bg-hover" onClick={() => { onChange(sfx.id); setOpen(false); }}>
                <span>{sfx.label}</span>
                <span className="text-[11px] text-fg-muted">{sfx.durationMs} ms</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
