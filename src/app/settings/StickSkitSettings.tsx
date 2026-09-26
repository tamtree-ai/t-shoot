"use client";

import { useState, useTransition } from "react";

import type { StickSkitDefaults } from "@/types/stick-skit";
import { DEFAULT_VOICE_MAP, setLabel, STICK_VOICES, stickCatalog } from "@/types/stick-skit/catalog";
import { saveTypeDefaultsAction } from "./actions";

const toggleBase = "flex h-9 items-center rounded-lg border px-3.5 text-[13px] disabled:cursor-not-allowed";
const toggleOff = "border-line bg-transparent text-fg-2";
const toggleOn = "border-accent bg-accent-soft text-fg";
const label = "text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase";
const select = "h-9 rounded-lg border border-line bg-panel px-2.5 text-[13px] text-fg";

const TEMPLATE_LABELS: Record<string, string> = {
  exchange: "Exchange",
  interview: "Interview",
  "me-vs-me": "Me vs me",
  "pov-monologue": "POV monologue",
  "text-slam": "Text slam",
};

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** What this workspace allows for stick-figure skits (09 §4). Every new skit brief starts from it. */
export function StickSkitSettings({ defaults, canEdit }: { defaults: StickSkitDefaults; canEdit: boolean }) {
  const [sets, setSets] = useState(defaults.allowed_sets);
  const [characters, setCharacters] = useState(defaults.allowed_characters);
  const [voices, setVoices] = useState<Record<string, string>>({ ...DEFAULT_VOICE_MAP, ...defaults.voice_map });
  const [template, setTemplate] = useState(defaults.default_template ?? "");
  const [cap, setCap] = useState(Number(defaults.limit_usd).toFixed(2));
  const [hashtags, setHashtags] = useState(defaults.hashtags_suffix ?? "");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setStatus(null);
    startTransition(async () => {
      const r = await saveTypeDefaultsAction("stick_skit", {
        allowed_sets: sets,
        allowed_characters: characters,
        voice_map: Object.fromEntries(characters.map((c) => [c, voices[c] ?? STICK_VOICES[0].id])),
        ...(template && { default_template: template }),
        limit_usd: cap.trim(),
        ...(hashtags.trim() && { hashtags_suffix: hashtags.trim() }),
      });
      setStatus(r.ok ? { ok: true, text: "Saved. New briefs start from these." } : { ok: false, text: r.error });
    });
  }

  return (
    <fieldset disabled={!canEdit || pending} className="flex flex-col gap-[22px]">
      <div role="group" aria-label="Characters" className="flex flex-col gap-2.5">
        <span className={label}>Characters and their voices</span>
        <div className="flex flex-col gap-2">
          {stickCatalog.characters.map((c) => {
            const on = characters.includes(c.id);
            return (
              <div key={c.id} className="flex items-center gap-3">
                <button type="button" aria-pressed={on} onClick={() => setCharacters((l) => toggle(l, c.id))} className={`${toggleBase} w-28 ${on ? toggleOn : toggleOff}`}>
                  {c.name}
                </button>
                <select aria-label={`${c.name}'s voice`} value={voices[c.id] ?? STICK_VOICES[0].id} disabled={!on} onChange={(e) => setVoices((v) => ({ ...v, [c.id]: e.target.value }))} className={`${select} disabled:opacity-50`}>
                  {STICK_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id} · {v.desc}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      <div role="group" aria-label="Sets" className="flex flex-col gap-2.5">
        <span className={label}>
          Sets <span className="font-normal tracking-normal normal-case">· {sets.length} of {stickCatalog.sets.length}</span>
        </span>
        <div className="flex flex-wrap gap-1.5">
          {stickCatalog.sets.map((s) => (
            <button key={s.id} type="button" title={s.description} aria-pressed={sets.includes(s.id)} onClick={() => setSets((l) => toggle(l, s.id))} className={`${toggleBase} ${sets.includes(s.id) ? toggleOn : toggleOff}`}>
              {setLabel(s.id)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <label className="flex flex-col gap-2.5">
          <span className={label}>Starting format</span>
          <select value={template} onChange={(e) => setTemplate(e.target.value as typeof template)} className={select}>
            <option value="">Writer&rsquo;s pick</option>
            {stickCatalog.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {TEMPLATE_LABELS[t.id] ?? t.id}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2.5">
          <span className={label}>Hashtags on every caption</span>
          <input value={hashtags} maxLength={200} onChange={(e) => setHashtags(e.target.value)} placeholder="#skit #comedy" className={select} />
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
