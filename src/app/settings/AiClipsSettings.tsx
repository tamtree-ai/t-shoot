"use client";

import { useState, useTransition } from "react";

import type { AiClipsDefaults } from "@/types/ai-clips";
import { BRIEF_LENGTHS, BRIEF_LOOKS, BRIEF_VOICES } from "@/types/ai-clips/catalog";
import { saveTypeDefaultsAction } from "./actions";

const toggleBase = "flex h-9 items-center rounded-lg border px-3.5 text-[13px] disabled:cursor-not-allowed";
const toggleOff = "border-line bg-transparent text-fg-2";
const toggleOn = "border-accent bg-accent-soft text-fg";
const label = "text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase";

/** What this workspace allows for AI clips (08, decision 4). Every new AI clips brief starts from it. */
export function AiClipsSettings({ defaults, canEdit }: { defaults: AiClipsDefaults; canEdit: boolean }) {
  const [voice, setVoice] = useState(defaults.default_voice);
  const [look, setLook] = useState(defaults.default_look);
  const [maxLength, setMaxLength] = useState(defaults.max_length_s);
  const [cap, setCap] = useState(Number(defaults.limit_usd).toFixed(2));
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setStatus(null);
    startTransition(async () => {
      const r = await saveTypeDefaultsAction("ai_clips", { default_voice: voice, default_look: look, max_length_s: maxLength, limit_usd: cap.trim() });
      setStatus(r.ok ? { ok: true, text: "Saved. New briefs start from these." } : { ok: false, text: r.error });
    });
  }

  return (
    <fieldset disabled={!canEdit || pending} className="flex flex-col gap-[22px]">
      <div role="group" aria-label="Longest video" className="flex flex-col gap-2.5">
        <span className={label}>Longest video</span>
        <div className="flex gap-1.5">
          {BRIEF_LENGTHS.map((s) => (
            <button key={s} type="button" aria-pressed={maxLength === s} onClick={() => setMaxLength(s)} className={`${toggleBase} font-mono ${maxLength === s ? toggleOn : toggleOff}`}>
              {s}s
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <label className="flex flex-col gap-2.5">
          <span className={label}>Starting voice</span>
          <select value={voice} onChange={(e) => setVoice(e.target.value)} className="h-9 rounded-lg border border-line bg-panel px-2.5 text-[13px] text-fg">
            {BRIEF_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.desc}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2.5">
          <span className={label}>Starting look</span>
          <select value={look} onChange={(e) => setLook(e.target.value)} className="h-9 rounded-lg border border-line bg-panel px-2.5 text-[13px] text-fg">
            {BRIEF_LOOKS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-2.5">
        <span className={label}>Spend cap per video</span>
        <span className="flex items-center gap-2 text-[13px] text-fg-2">
          <span className="font-mono">$</span>
          <input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" className="h-9 w-24 rounded-lg border border-line bg-panel px-2.5 font-mono text-fg" />
          <span className="text-xs text-fg-muted">A video&rsquo;s limit starts here and can never be raised past it.</span>
        </span>
      </label>

      {canEdit ? (
        <div className="flex items-center gap-4">
          <button type="button" onClick={save} className="flex h-10 items-center rounded-[10px] bg-accent px-[18px] text-sm font-semibold text-accent-ink disabled:opacity-60">
            {pending ? "Saving…" : "Save"}
          </button>
          {status && (
            <p role={status.ok ? "status" : "alert"} className={`text-[13px] ${status.ok ? "text-fg-muted" : "text-[#ff8a64]"}`}>
              {status.text}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-fg-muted">Only the workspace owner can change these.</p>
      )}
    </fieldset>
  );
}
