"use client";

import { useState, useTransition } from "react";

import { CharacterThumb, SetThumb } from "@/components/stick-skit/Thumbs";
import { STICK_SCRIPT_PRICE_USD } from "@/lib/estimate";
import type { StickBrief, StickCast } from "@/lib/tamtree/stage-flows";
import { stickBriefOutsideDefaults, type StickSkitDefaults } from "@/types/stick-skit";
import { characterName, setLabel, stickCatalog } from "@/types/stick-skit/catalog";
import { createStickProjectAction } from "./actions";

const toggleBase = "flex h-9 items-center rounded-lg border px-3.5 text-[13px]";
const toggleOff = "border-line bg-transparent text-fg-2";
const toggleOn = "border-accent bg-accent-soft text-fg";
const label = "text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase";
const card = (selected: boolean) =>
  `relative overflow-hidden rounded-[10px] border bg-[#0c0c0f] ${selected ? "border-accent shadow-[0_0_0_1px_var(--color-accent)]" : "border-rule hover:border-line-strong"}`;

type TemplateId = NonNullable<StickBrief["template"]>;

const TEMPLATE_LABELS: Record<TemplateId, string> = {
  exchange: "Exchange",
  interview: "Interview",
  "me-vs-me": "Me vs me",
  "pov-monologue": "POV monologue",
  "text-slam": "Text slam",
};
const TONES = ["Deadpan", "Wholesome", "Chaotic", "Dry"];

/**
 * The `stick_skit` brief (09 §6.2): what it's about, the format, who's in it and where,
 * drawn by the engine itself. The org's defaults filter the galleries and cap the limit.
 * No paid call: saving the brief is free, the skit is written on the next screen.
 */
export function StickBriefForm({ defaults }: { defaults: StickSkitDefaults }) {
  const characters = stickCatalog.characters.filter((c) => defaults.allowed_characters.includes(c.id));
  const sets = stickCatalog.sets.filter((s) => defaults.allowed_sets.includes(s.id));

  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState<TemplateId | null>(defaults.default_template ?? null);
  const [picked, setPicked] = useState<string[]>(characters.slice(0, 1).map((c) => c.id));
  const [selves, setSelves] = useState(["me", "my brain"]);
  const [set, setSet] = useState<string | null>(null);
  const [tone, setTone] = useState<string | null>(null);
  const [limit, setLimit] = useState(Number(defaults.limit_usd).toFixed(2));
  const [editingLimit, setEditingLimit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const castSize = template ? stickCatalog.templates.find((t) => t.id === template)!.cast : 2;
  const selfMode = template === "me-vs-me";
  const maxPicked = selfMode ? 1 : castSize;

  function chooseTemplate(next: TemplateId | null) {
    setTemplate(next);
    const size = next === "me-vs-me" ? 1 : next ? stickCatalog.templates.find((t) => t.id === next)!.cast : 2;
    setPicked((p) => p.slice(0, size));
  }

  function toggleCharacter(id: string) {
    setPicked((p) => {
      if (p.includes(id)) return p.length > 1 ? p.filter((c) => c !== id) : p;
      return maxPicked === 1 ? [id] : [...p, id].slice(-maxPicked);
    });
  }

  function cast(): StickCast[] {
    if (selfMode) {
      const character = picked[0]!;
      return [
        { id: "me", character, label: selves[0]!.trim() || undefined },
        { id: "other", character, label: selves[1]!.trim() || undefined },
      ].map((c) => (c.label ? c : { id: c.id, character: c.character }));
    }
    return picked.map((character) => ({ id: character, character }));
  }

  function submit() {
    if (!topic.trim()) {
      setError("Say what the skit is about.");
      return;
    }
    if (template && !selfMode && picked.length !== castSize) {
      setError(`${TEMPLATE_LABELS[template]} needs ${castSize === 1 ? "one character" : "two characters"}.`);
      return;
    }
    const brief: StickBrief = {
      topic: topic.trim(),
      ...(description.trim() && { description: description.trim() }),
      ...(template && { template }),
      cast: cast(),
      ...(set && { set }),
      ...(tone && { tone: tone.toLowerCase() }),
    };
    const limitUsd = Number(limit || defaults.limit_usd).toFixed(2);
    const refusal = stickBriefOutsideDefaults(brief, limitUsd, defaults);
    if (refusal) {
      setError(refusal);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createStickProjectAction({ ...brief, limitUsd });
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex w-[760px] flex-col gap-[26px] py-12 pb-8">
      <div className="flex flex-col gap-3">
        <label htmlFor="topic" className="font-display text-[40px] leading-[1.05] tracking-[-0.01em]">
          What&rsquo;s the skit about?
        </label>
        <textarea
          id="topic"
          rows={2}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Replying “sounds good” to a message you didn’t read."
          className="box-border w-full resize-none rounded-xl border border-accent bg-panel px-[18px] py-4 text-[17px] leading-normal text-fg shadow-[0_0_0_3px_rgba(255,106,61,0.16)] placeholder:text-fg-muted"
        />
        <textarea
          aria-label="Anything else the writer should know (optional)"
          rows={2}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Anything else the writer should know: who it’s for, the joke you want to land. Optional."
          className="box-border w-full resize-none rounded-xl border border-rule bg-panel px-[18px] py-3 text-sm leading-normal text-fg placeholder:text-fg-muted"
        />
        <span className="text-xs text-fg-muted">You&rsquo;ll read and edit every line before anything is voiced.</span>
      </div>

      <div role="group" aria-label="Format" className="flex flex-col gap-2.5">
        <span className={label}>Format</span>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={template === null} onClick={() => chooseTemplate(null)} className={`${toggleBase} ${template === null ? toggleOn : toggleOff}`}>
            Writer&rsquo;s pick
          </button>
          {stickCatalog.templates.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.description}
              aria-pressed={template === t.id}
              onClick={() => chooseTemplate(t.id)}
              className={`${toggleBase} ${template === t.id ? toggleOn : toggleOff}`}
            >
              {TEMPLATE_LABELS[t.id]}
            </button>
          ))}
        </div>
        <span className="text-xs text-fg-muted">
          {template ? stickCatalog.templates.find((t) => t.id === template)!.description : "The writer picks the format that fits your cast and topic."}
        </span>
      </div>

      <div role="group" aria-label="Cast" className="flex flex-col gap-2.5">
        <span className={label}>
          Cast <span className="font-normal tracking-normal normal-case">· {selfMode ? "one character, two sides" : maxPicked === 1 ? "one character" : "one or two"}</span>
        </span>
        <div className="grid grid-cols-6 gap-2">
          {characters.map((c) => {
            const selected = picked.includes(c.id);
            return (
              <button key={c.id} type="button" aria-pressed={selected} onClick={() => toggleCharacter(c.id)} className={`${card(selected)} aspect-[9/16]`}>
                <CharacterThumb id={c.id} className="absolute inset-0" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 pt-6 pb-2 text-left text-xs font-medium text-white">{c.name}</span>
              </button>
            );
          })}
        </div>
        {selfMode && (
          <div className="grid grid-cols-2 gap-2">
            {selves.map((v, i) => (
              <label key={i} className="flex flex-col gap-1.5">
                <span className="text-xs text-fg-muted">
                  {characterName(picked[0] ?? "")} {i === 0 ? "as" : "versus"}
                </span>
                <input
                  value={v}
                  maxLength={24}
                  onChange={(e) => setSelves((s) => s.map((x, j) => (j === i ? e.target.value : x)))}
                  className="h-9 rounded-lg border border-line bg-panel px-2.5 text-[13px] text-fg"
                />
              </label>
            ))}
          </div>
        )}
      </div>

      <div role="group" aria-label="Set" className="flex flex-col gap-2.5">
        <span className={label}>Set</span>
        <div className="grid grid-cols-8 gap-2">
          <button type="button" aria-pressed={set === null} onClick={() => setSet(null)} className={`${card(set === null)} flex aspect-[9/16] items-center justify-center p-2 text-center text-xs text-fg-2`}>
            Writer&rsquo;s pick
          </button>
          {sets.map((s) => (
            <button key={s.id} type="button" aria-pressed={set === s.id} title={s.description} onClick={() => setSet(s.id)} className={`${card(set === s.id)} aspect-[9/16]`}>
              <SetThumb id={s.id} className="absolute inset-0" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pt-5 pb-1.5 text-left text-[11px] font-medium text-white">{setLabel(s.id)}</span>
            </button>
          ))}
        </div>
      </div>

      <div role="group" aria-label="Tone" className="flex flex-col gap-2.5">
        <span className={label}>Tone</span>
        <div className="flex gap-1.5">
          <button type="button" aria-pressed={tone === null} onClick={() => setTone(null)} className={`${toggleBase} ${tone === null ? toggleOn : toggleOff}`}>
            Any
          </button>
          {TONES.map((t) => (
            <button key={t} type="button" aria-pressed={tone === t} onClick={() => setTone(t)} className={`${toggleBase} ${tone === t ? toggleOn : toggleOff}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 pt-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="flex h-[46px] items-center gap-2.5 rounded-[10px] bg-accent px-[22px] text-[15px] font-semibold text-accent-ink disabled:opacity-60"
        >
          {pending ? "Saving…" : "Write the skit"}
          <span className="font-mono text-xs font-medium">~${STICK_SCRIPT_PRICE_USD.toFixed(2)}</span>
        </button>
        <span className="text-xs leading-relaxed text-fg-muted">
          You&rsquo;ll see what voicing costs before anything is spent.
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
