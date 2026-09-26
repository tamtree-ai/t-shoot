"use client";

import { useState, useTransition } from "react";

import { briefOutsideDefaults, type AiClipsDefaults } from "@/types/ai-clips";
import { BRIEF_LENGTHS, BRIEF_LOOKS as LOOKS, BRIEF_TONES as TONES, BRIEF_VOICES as VOICES } from "@/types/ai-clips/catalog";
import { createProjectAction } from "./actions";

const toggleBase = "flex h-9 items-center rounded-lg border px-3.5 text-[13px]";
const toggleOff = "border-line bg-transparent text-fg-2";
const toggleOn = "border-accent bg-accent-soft text-fg";

/** The `ai_clips` brief. The org's defaults preselect the voice and look and bound the length and limit. */
export function BriefForm({ defaults }: { defaults: AiClipsDefaults }) {
  const LENGTHS = BRIEF_LENGTHS.filter((s) => s <= defaults.max_length_s);
  const [topic, setTopic] = useState("");
  const [lengthS, setLengthS] = useState<(typeof BRIEF_LENGTHS)[number]>(Math.min(45, defaults.max_length_s) as 30 | 45 | 60);
  const [tone, setTone] = useState(TONES[0]);
  const [voice, setVoice] = useState<string>(defaults.default_voice);
  const [look, setLook] = useState<string>(defaults.default_look);
  const [limit, setLimit] = useState(Number(defaults.limit_usd).toFixed(2));
  const [editingLimit, setEditingLimit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!topic.trim()) {
      setError("Say what the video is about.");
      return;
    }
    const brief = { topic: topic.trim(), length_s: lengthS, tone: tone.toLowerCase(), look, voice };
    const limitUsd = Number(limit || defaults.limit_usd).toFixed(2);
    const refusal = briefOutsideDefaults(brief, limitUsd, defaults);
    if (refusal) {
      setError(refusal);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createProjectAction({ ...brief, limitUsd });
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex w-[760px] flex-col gap-[26px] py-12 pb-8">
      <div className="flex flex-col gap-3">
        <label htmlFor="topic" className="font-display text-[40px] leading-[1.05] tracking-[-0.01em]">
          What&rsquo;s the video about?
        </label>
        <textarea
          id="topic"
          rows={3}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Why an octopus has three hearts, and why swimming wears it out. For curious adults, ends on a surprising fact."
          className="box-border w-full resize-none rounded-xl border border-accent bg-panel px-[18px] py-4 text-[17px] leading-normal text-fg shadow-[0_0_0_3px_rgba(255,106,61,0.16)] placeholder:text-fg-muted"
        />
        <span className="text-xs text-fg-muted">
          Say who it&rsquo;s for and how it should land. You&rsquo;ll read and edit every line before anything is filmed.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div role="group" aria-label="Length" className="flex flex-col gap-2.5">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Length</span>
          <div className="flex gap-1.5">
            {LENGTHS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={lengthS === s}
                onClick={() => setLengthS(s)}
                className={`${toggleBase} font-mono ${lengthS === s ? toggleOn : toggleOff}`}
              >
                {s}s
              </button>
            ))}
          </div>
        </div>
        <div role="group" aria-label="Tone" className="flex flex-col gap-2.5">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Tone</span>
          <div className="flex gap-1.5">
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tone === t}
                onClick={() => setTone(t)}
                className={`${toggleBase} ${tone === t ? toggleOn : toggleOff}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div role="group" aria-label="Voice" className="flex flex-col gap-2.5">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Voice</span>
        <div className="grid grid-cols-4 gap-2">
          {VOICES.map((v) => {
            const selected = voice === v.id;
            return (
              <div
                key={v.id}
                className={`flex items-center gap-2.5 rounded-[10px] p-2.5 ${
                  selected ? "bg-raised shadow-[inset_0_0_0_1px_var(--color-accent)]" : "border border-rule"
                }`}
              >
                <button
                  type="button"
                  aria-label={`Play a sample of ${v.name}`}
                  className={`flex size-[30px] shrink-0 items-center justify-center rounded-full ${
                    selected ? "bg-accent text-accent-ink" : "border border-line-strong text-fg-2"
                  }`}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 4l14 8-14 8z" />
                  </svg>
                </button>
                <button type="button" aria-pressed={selected} onClick={() => setVoice(v.id)} className="flex flex-col text-left">
                  <span className="text-[13px] font-medium">{v.name}</span>
                  <span className="text-[11px] text-fg-muted">{v.desc}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div role="group" aria-label="Look" className="flex flex-col gap-2.5">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Look</span>
        <div className="grid grid-cols-4 gap-2">
          {LOOKS.map((l) => {
            const selected = look === l.id;
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setLook(l.id)}
                style={{ background: l.gradient }}
                className={`relative h-24 overflow-hidden rounded-[10px] border ${
                  selected ? "border-accent shadow-[0_0_0_1px_var(--color-accent)]" : "border-rule"
                }`}
              >
                <span className="absolute bottom-2 left-2.5 text-xs font-medium text-white">{l.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-4 pt-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="flex h-[46px] items-center gap-2.5 rounded-[10px] bg-accent px-[22px] text-[15px] font-semibold text-accent-ink disabled:opacity-60"
        >
          {pending ? "Writing the script…" : "Write the script"}
          <span className="font-mono text-xs font-medium">under $0.01</span>
        </button>
        <span className="text-xs leading-relaxed text-fg-muted">
          You&rsquo;ll see what filming costs before anything is spent.
          <br />
          Limit for this video{" "}
          {editingLimit ? (
            <input
              autoFocus
              aria-label={`Limit for this video, up to $${defaults.limit_usd}`}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              onBlur={() => setEditingLimit(false)}
              className="w-16 rounded border border-line bg-panel px-1 font-mono text-fg-2"
            />
          ) : (
            <span className="font-mono text-fg-2">${limit}</span>
          )}{" "}
          ·{" "}
          <button type="button" onClick={() => setEditingLimit(true)} className="text-accent-link hover:text-[#ffb199]">
            change
          </button>
        </span>
      </div>
      {error && <p className="text-sm text-[#ff8a64]">{error}</p>}
    </div>
  );
}
