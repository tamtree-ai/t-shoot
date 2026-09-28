"use client";

import { useState, useTransition } from "react";

import { CharacterThumb, SetThumb } from "@/components/stick-skit/Thumbs";
import { STICK_SCRIPT_PRICE_USD } from "@/lib/estimate";
import { ASPECT_LABEL, ASPECTS, engineTakesBriefAspect, FRAME, frameClass, isAspect, type Aspect } from "@/lib/stick/frame";
import type { StickBrief, StickCast } from "@/lib/tamtree/stage-flows";
import { stickBriefOutsideDefaults, type StickSkitDefaults } from "@/types/stick-skit";
import { characterAspect, characterName, MULTI_SCENE_WRITER_LIVE, setAspect, setLabel, stickCatalog } from "@/types/stick-skit/catalog";
import { createStickProjectAction } from "./actions";
import { StartPanel, StartTabs } from "./StartPanel";

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
  explainer: "Explainer",
  family: "Family",
  fable: "Fable",
  trio: "Trio",
};

function templateLabel(id: string): string {
  return id in TEMPLATE_LABELS ? TEMPLATE_LABELS[id as TemplateId] : id;
}

const TONES = ["Deadpan", "Wholesome", "Chaotic", "Dry"];
const SCENE_COUNTS = [
  { n: 1, label: "One" },
  { n: 2, label: "Two" },
  { n: 3, label: "Three" },
  { n: 4, label: "Four" },
] as const;

/**
 * The `stick_skit` brief (09 §6.2): what it's about, the format, who's in it and where,
 * drawn by the engine itself. The org's defaults filter the galleries and cap the limit.
 * No paid call: saving the brief is free, the skit is written on the next screen.
 */
export function StickBriefForm({
  defaults,
  showId,
  episodeNumber,
  initial,
  saved = [],
}: {
  defaults: StickSkitDefaults;
  showId?: string;
  episodeNumber?: number;
  initial?: { template?: TemplateId | null; cast?: string[]; set?: string; tone?: string | null; topic?: string; aspect?: Aspect | null };
  /** Workspace characters. A `rig` is a built character; without one, the picture stays the catalog body. */
  saved?: { id: string; name: string; body: string; rig?: Record<string, unknown> }[];
}) {
  const [aspect, setFrame] = useState<Aspect>(isAspect(initial?.aspect) ? initial.aspect : "9:16");
  const characters = stickCatalog.characters.filter((c) => defaults.allowed_characters.includes(c.id) && characterAspect(c.id) === aspect);
  const catalogSets = stickCatalog.sets.filter((s) => defaults.allowed_sets.includes(s.id) && setAspect(s.id) === aspect);
  const widescreenClosed = aspect === "16:9" && !engineTakesBriefAspect();

  const [mode, setMode] = useState<"topic" | "paste" | "link">("topic");
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState<TemplateId | null>(initial?.template ?? defaults.default_template ?? null);
  const startTemplate = initial?.template ?? defaults.default_template ?? null;
  const startSize = !startTemplate || startTemplate === "me-vs-me" ? 1 : stickCatalog.templates.find((t) => t.id === startTemplate)!.cast;
  const [picked, setPicked] = useState<string[]>(() => {
    const fromShow = (initial?.cast ?? []).filter((id) => characterAspect(id) === aspect);
    return fromShow.length > 0 ? fromShow : characters.slice(0, startSize).map((c) => c.id);
  });
  const [selves, setSelves] = useState(["me", "my brain"]);
  const [scenes, setScenes] = useState(1);
  /** The picked sets in scene order: at most one per scene; none is the writer's pick. */
  const [sets, setSets] = useState<string[]>(initial?.set && setAspect(initial.set) === aspect ? [initial.set] : []);
  const [hoverSet, setHoverSet] = useState<string | null>(null);
  const [tone, setTone] = useState<string | null>(initial?.tone ?? null);
  const [targetS, setTargetS] = useState<15 | 30 | 45 | 60 | null>(null);
  const [limit, setLimit] = useState(Number(defaults.limit_usd).toFixed(2));
  const [editingLimit, setEditingLimit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [original, setOriginal] = useState(false);
  const [pending, startTransition] = useTransition();

  const castSize = template ? stickCatalog.templates.find((t) => t.id === template)!.cast : 2;
  const selfMode = template === "me-vs-me";
  const maxPicked = selfMode ? 1 : castSize;

  function chooseAspect(next: Aspect) {
    setFrame(next);
    const people = stickCatalog.characters.filter((c) => defaults.allowed_characters.includes(c.id) && characterAspect(c.id) === next);
    const size = template === "me-vs-me" ? 1 : template ? stickCatalog.templates.find((t) => t.id === template)!.cast : 2;
    setPicked(people.slice(0, size).map((c) => c.id));
    setSets((prev) => prev.filter((id) => setAspect(id) === next));
  }

  function chooseTemplate(next: TemplateId | null) {
    setTemplate(next);
    const size = next === "me-vs-me" ? 1 : next ? stickCatalog.templates.find((t) => t.id === next)!.cast : 2;
    setPicked((p) => {
      const kept = p.slice(0, size);
      if (kept.length >= size) return kept;
      const rest = characters.map((c) => c.id).filter((id) => !kept.includes(id));
      return [...kept, ...rest].slice(0, size);
    });
  }

  function toggleCharacter(id: string) {
    setPicked((p) => {
      if (p.includes(id)) return p.length > 1 ? p.filter((c) => c !== id) : p;
      return maxPicked === 1 ? [id] : [...p, id].slice(-maxPicked);
    });
  }

  function chooseScenes(n: number) {
    setScenes(n);
    setSets((p) => p.slice(0, n));
  }

  function toggleSet(id: string) {
    setSets((p) => {
      if (scenes === 1) return [id];
      if (p.includes(id)) return p.filter((s) => s !== id);
      return p.length < scenes ? [...p, id] : [...p.slice(0, -1), id];
    });
  }

  function resolve(key: string): { id: string; character: string; rig?: Record<string, unknown> } {
    if (key.startsWith("saved:")) {
      const row = saved.find((c) => `saved:${c.id}` === key);
      const id = typeof row?.rig?.id === "string" ? row.rig.id : row?.body ?? "milo";
      return { id, character: id, ...(row?.rig ? { rig: row.rig } : {}) };
    }
    return { id: key, character: key };
  }

  function cast(): StickCast[] {
    if (selfMode) {
      const character = resolve(picked[0]!).character;
      return [
        { id: "me", character, label: selves[0]!.trim() || undefined },
        { id: "other", character, label: selves[1]!.trim() || undefined },
      ].map((c) => (c.label ? c : { id: c.id, character: c.character }));
    }
    return picked.map((key) => {
      const resolved = resolve(key);
      return { id: resolved.id, character: resolved.character };
    });
  }

  function workspaceCharacters(): Record<string, unknown>[] {
    const docs = picked.flatMap((key) => {
      const rig = resolve(key).rig;
      return rig ? [rig] : [];
    });
    const seen = new Set<string>();
    return docs.filter((doc) => {
      const id = typeof doc.id === "string" ? doc.id : "";
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function submit() {
    if (widescreenClosed) {
      setError("This StickStage build only writes shorts. Widescreen is not in the writer yet.");
      return;
    }
    if (!topic.trim()) {
      setError("Say what the skit is about.");
      return;
    }
    if (characters.length === 0) {
      setError("Pick a character drawn for this frame.");
      return;
    }
    if (template && !selfMode && picked.length !== castSize) {
      setError(`${templateLabel(template)} needs ${castSize === 1 ? "one character" : "two characters"}.`);
      return;
    }
    const custom = workspaceCharacters();
    if (custom.length > 0 && !original) {
      setError("Confirm these are original characters.");
      return;
    }
    const brief: StickBrief = {
      topic: topic.trim(),
      ...(description.trim() && { description: description.trim() }),
      ...(template && { template }),
      aspect,
      cast: cast(),
      ...(custom.length > 0 && { characters: custom }),
      ...(scenes === 1 ? sets[0] && { set: sets[0] } : { scenes, ...(sets.length > 0 && { sets }) }),
      ...(tone && { tone: tone.toLowerCase() }),
      ...(targetS && { target_s: targetS }),
    };
    const limitUsd = Number(limit || defaults.limit_usd).toFixed(2);
    const refusal = stickBriefOutsideDefaults(brief, limitUsd, defaults);
    if (refusal) {
      setError(refusal);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createStickProjectAction({ ...brief, limitUsd, showId, episodeNumber });
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex w-full max-w-[880px] flex-col gap-8 py-12 pb-8">
      <div className="flex flex-col gap-3">
        <StartTabs mode={mode} onChange={setMode} />
        <label htmlFor="topic" className="font-display text-[40px] leading-[1.05] tracking-[-0.01em]">
          What&rsquo;s the skit about?
        </label>
        {mode !== "topic" && (
          <StartPanel
            mode={mode}
            kind="stick_skit"
            characters={characters.map((c) => ({ id: c.id, name: c.name }))}
            sets={catalogSets.map((s) => ({ id: s.id, label: setLabel(s.id) }))}
            aspect={aspect}
            limitUsd={Number(limit || defaults.limit_usd).toFixed(2)}
            showId={showId}
            episodeNumber={episodeNumber}
            onTopic={(next) => {
              setTopic(next);
              setMode("topic");
            }}
          />
        )}
        {mode === "topic" && <textarea
          id="topic"
          rows={2}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Replying “sounds good” to a message you didn’t read."
          className="box-border w-full resize-none rounded-xl border border-line bg-panel px-[18px] py-4 text-[17px] leading-normal text-fg placeholder:text-fg-muted focus:border-accent focus:shadow-[0_0_0_3px_rgba(255,106,61,0.16)]"
        />}
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

      <div role="group" aria-label="Shape" className="flex flex-col gap-2.5">
        <span className={label}>Shape</span>
        <div className="flex flex-wrap gap-1.5">
          {ASPECTS.map((id) => (
            <button key={id} type="button" aria-pressed={aspect === id} onClick={() => chooseAspect(id)} className={`${toggleBase} ${aspect === id ? toggleOn : toggleOff}`}>
              {ASPECT_LABEL[id]}
              <span className="ml-1.5 font-mono text-[11px] font-normal">{id}</span>
            </button>
          ))}
        </div>
        <span className="text-xs text-fg-muted">
          {widescreenClosed
            ? "Widescreen is 1920×1080. This StickStage build still only writes shorts."
            : aspect === "16:9" && characters.length === 0
              ? "This StickStage build has no widescreen cast yet."
              : `${ASPECT_LABEL[aspect]} · ${FRAME[aspect].width}×${FRAME[aspect].height}. Cast and rooms stay on this frame.`}
        </span>
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
              aria-pressed={template === t.id}
              onClick={() => chooseTemplate(t.id)}
              className={`${toggleBase} ${template === t.id ? toggleOn : toggleOff}`}
            >
              {templateLabel(t.id)}
            </button>
          ))}
        </div>
        <span className="text-xs text-fg-muted">
          {template ? stickCatalog.templates.find((t) => t.id === template)!.description : "The writer picks the format that fits your cast and topic."}
        </span>
      </div>

      <div role="group" aria-label="Cast" className="flex flex-col gap-2.5">
        <span className={label}>
          Cast <span className="font-normal tracking-normal normal-case">· {selfMode ? "one character, two sides" : maxPicked === 1 ? "one character" : maxPicked === 2 && template ? "two characters" : "one or two"}</span>
        </span>
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
        <div className="grid grid-cols-6 gap-2">
          {characters.map((c) => {
            const selected = picked.includes(c.id);
            return (
              <button key={c.id} type="button" aria-pressed={selected} onClick={() => toggleCharacter(c.id)} className={`${card(selected)} ${frameClass(aspect)}`}>
                <CharacterThumb id={c.id} className="absolute inset-0" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 pt-6 pb-2 text-left text-xs font-medium text-white">{c.name}</span>
              </button>
            );
          })}
          {saved.filter((c) => defaults.allowed_characters.includes(c.body) && (!isAspect(c.rig?.aspect) || c.rig.aspect === aspect)).map((c) => {
            const key = c.rig ? `saved:${c.id}` : c.body;
            const selected = picked.includes(key);
            return (
              <button key={c.id} type="button" aria-pressed={selected} onClick={() => toggleCharacter(key)} className={`${card(selected)} ${frameClass(aspect)}`}>
                <CharacterThumb id={c.body} className="absolute inset-0" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 pt-6 pb-2 text-left text-xs font-medium text-white">{c.name}</span>
              </button>
            );
          })}
        </div>
        {saved.some((c) => c.rig) && (
          <label className="flex items-center gap-2 text-[13px] text-fg-2">
            <input type="checkbox" checked={original} onChange={(e) => setOriginal(e.target.checked)} />
            Original characters only. Don’t use a real person’s likeness, or a character you don’t have the rights to.
          </label>
        )}
      </div>

      <div role="group" aria-label="Scenes" className="flex flex-col gap-2.5">
        <span className={label}>Scenes</span>
        {MULTI_SCENE_WRITER_LIVE ? (
          <>
            <div className="flex gap-1.5">
              {SCENE_COUNTS.map(({ n, label: word }) => (
                <button key={n} type="button" aria-pressed={scenes === n} onClick={() => chooseScenes(n)} className={`${toggleBase} ${scenes === n ? toggleOn : toggleOff}`}>
                  {word}
                </button>
              ))}
            </div>
            <span className="text-xs text-fg-muted">{scenes === 1 ? "The whole skit plays on one set." : `The skit moves through ${scenes} sets, one per scene.`}</span>
          </>
        ) : (
          <span className="text-xs text-fg-muted">One scene for now.</span>
        )}
      </div>

      <div role="group" aria-label={scenes === 1 ? "Set" : "Sets"} className="flex flex-col gap-2.5">
        <span className={label}>
          {scenes === 1 ? (
            "Set"
          ) : (
            <>
              Sets <span className="font-normal tracking-normal normal-case">· up to {scenes}, in scene order; the writer picks the rest</span>
            </>
          )}
        </span>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          <button type="button" aria-pressed={sets.length === 0} onClick={() => setSets([])} className={`${card(sets.length === 0)} flex ${frameClass(aspect)} items-center justify-center p-2 text-center text-xs leading-snug text-fg-2`}>
            Writer&rsquo;s pick
          </button>
          {catalogSets.map((s) => {
            const order = sets.indexOf(s.id);
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={order >= 0}
                aria-label={scenes > 1 && order >= 0 ? `${setLabel(s.id)}, scene ${order + 1}` : setLabel(s.id)}
                title={s.description}
                onMouseEnter={() => setHoverSet(s.id)}
                onMouseLeave={() => setHoverSet((h) => (h === s.id ? null : h))}
                onFocus={() => setHoverSet(s.id)}
                onBlur={() => setHoverSet((h) => (h === s.id ? null : h))}
                onClick={() => toggleSet(s.id)}
                className={`${card(order >= 0)} ${frameClass(aspect)}`}
              >
                <SetThumb id={s.id} className="absolute inset-0" />
                {scenes > 1 && order >= 0 && (
                  <span aria-hidden className="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full bg-accent font-mono text-[11px] font-semibold text-accent-ink">
                    {order + 1}
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pt-5 pb-1.5 text-left text-[11px] font-medium text-white">{setLabel(s.id)}</span>
              </button>
            );
          })}
        </div>
        <SetCaption id={hoverSet ?? sets.at(-1) ?? null} />
      </div>

      <div role="group" aria-label="Length" className="flex flex-col gap-2.5">
        <span className={label}>Length</span>
        <div className="flex gap-1.5">
          <button type="button" aria-pressed={targetS === null} onClick={() => setTargetS(null)} className={`${toggleBase} ${targetS === null ? toggleOn : toggleOff}`}>
            Any
          </button>
          {([15, 30, 45, 60] as const).map((n) => (
            <button key={n} type="button" aria-pressed={targetS === n} onClick={() => setTargetS(n)} className={`${toggleBase} ${targetS === n ? toggleOn : toggleOff}`}>
              {n}s
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

      <div className="flex flex-wrap items-center gap-4 border-t border-rule pt-5">
        <button
          type="button"
          disabled={pending || widescreenClosed}
          onClick={submit}
          className="flex h-[46px] items-center gap-2.5 rounded-[10px] bg-accent px-[22px] text-[15px] font-semibold text-accent-ink disabled:opacity-60"
        >
          {pending ? "Writing the skit…" : "Write the skit"}
          <span className="font-mono text-xs font-medium">up to ${STICK_SCRIPT_PRICE_USD.toFixed(2)}</span>
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

function SetCaption({ id }: { id: string | null }) {
  if (!id) return <p className="text-xs text-fg-muted">The writer picks the set that fits the joke.</p>;
  const entry = stickCatalog.sets.find((s) => s.id === id);
  return (
    <p className="text-xs text-fg-muted">
      <span className="font-medium text-fg-2">{setLabel(id)}</span>
      {entry?.description ? ` — ${entry.description}` : ""}
    </p>
  );
}
