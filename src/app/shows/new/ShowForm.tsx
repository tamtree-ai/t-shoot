"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { saveShowAction } from "@/app/library-actions";
import { ASPECT_LABEL, ASPECTS, engineTakesBriefAspect, FRAME, type Aspect } from "@/lib/stick/frame";
import { characterAspect, setAspect as roomAspect } from "@/types/stick-skit/catalog";

export function ShowForm({
  characters,
  sets,
  templates,
  defaultCast,
  defaultSet,
  defaultTemplate,
  cap,
}: {
  characters: { id: string; name: string }[];
  sets: { id: string; name: string }[];
  templates: { id: string; label: string }[];
  defaultCast: string[];
  defaultSet?: string;
  defaultTemplate?: string;
  cap: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [template, setTemplate] = useState(defaultTemplate ?? "");
  const people = characters.filter((c) => characterAspect(c.id) === aspect);
  const rooms = sets.filter((s) => roomAspect(s.id) === aspect);
  const [cast, setCast] = useState<string[]>(() => defaultCast.filter((id) => characterAspect(id) === "9:16").slice(0, 2));
  const [setId, setSetId] = useState(defaultSet && roomAspect(defaultSet) === "9:16" ? defaultSet : "");
  const [tone, setTone] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [aiLine, setAiLine] = useState("Voices are AI-generated.");
  const [limit, setLimit] = useState(Number(cap).toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (aspect === "16:9" && !engineTakesBriefAspect()) {
          setError("This StickStage build only writes shorts. Widescreen is not in the writer yet.");
          return;
        }
        start(async () => {
          const result = await saveShowAction({
            name: name.trim(),
            ...(template ? { template } : {}),
            aspect,
            cast: cast.map((id, i) => ({ id: `c${i + 1}`, character: id })),
            ...(setId ? { set: setId } : {}),
            ...(tone.trim() ? { tone: tone.trim() } : {}),
            ...(hashtags.trim() ? { hashtags: hashtags.trim() } : {}),
            ...(aiLine.trim() ? { ai_line: aiLine.trim() } : {}),
            limit_usd: limit.trim(),
          });
          if (!result.ok) setError(result.error);
          else router.push("/");
        });
      }}
    >
      <Field label="Name">
        <input required aria-label="Name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} className={input} />
      </Field>
      <Field label="Shape">
        <div role="group" aria-label="Shape" className="flex flex-wrap gap-1.5">
          {ASPECTS.map((id) => (
            <Chip
              key={id}
              on={aspect === id}
              onClick={() => {
                setAspect(id);
                const ids = characters.filter((c) => characterAspect(c.id) === id).map((c) => c.id);
                setCast(ids.slice(0, 2));
                setSetId(sets.find((s) => roomAspect(s.id) === id)?.id ?? "");
              }}
            >
              {`${ASPECT_LABEL[id]} · ${FRAME[id].width}×${FRAME[id].height}`}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Format">
        <div role="group" aria-label="Format" className="flex flex-wrap gap-1.5">
          <Chip on={template === ""} onClick={() => setTemplate("")}>Writer’s pick</Chip>
          {templates.map((t) => (
            <Chip key={t.id} on={template === t.id} onClick={() => setTemplate(t.id)}>{t.label}</Chip>
          ))}
        </div>
      </Field>
      <Field label="Cast">
        <div className="flex gap-2">
          {[0, 1].map((i) => (
            <select
              key={i}
              aria-label={i === 0 ? "First character" : "Second character"}
              value={cast[i] ?? ""}
              onChange={(e) => setCast((prev) => {
                const next = [...prev];
                if (e.target.value) next[i] = e.target.value;
                else next.splice(i, 1);
                return next.filter(Boolean);
              })}
              className={input}
            >
              {i === 1 && <option value="">None</option>}
              {people.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ))}
        </div>
      </Field>
      <Field label="Set">
        <select aria-label="Set" value={setId} onChange={(e) => setSetId(e.target.value)} className={input}>
          <option value="">Writer’s pick</option>
          {rooms.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Tone">
        <div role="group" aria-label="Tone" className="flex flex-wrap gap-1.5">
          <Chip on={tone === ""} onClick={() => setTone("")}>Any</Chip>
          {TONES.map((t) => (
            <Chip key={t} on={tone === t} onClick={() => setTone(t)}>{t}</Chip>
          ))}
        </div>
      </Field>
      <Field label="Hashtags">
        <input aria-label="Hashtags" value={hashtags} onChange={(e) => setHashtags(e.target.value)} className={input} />
      </Field>
      <Field label="AI line">
        <input aria-label="AI line" value={aiLine} onChange={(e) => setAiLine(e.target.value)} className={input} />
      </Field>
      <Field label="Spend cap">
        <input aria-label="Spend cap" value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" className={input} />
      </Field>
      {error && <p className="text-[13px] text-attention">{error}</p>}
      {aspect === "16:9" && !engineTakesBriefAspect() && (
        <p className="text-[13px] text-fg-muted">Widescreen is 1920×1080. This StickStage build still only writes shorts.</p>
      )}
      <button type="submit" disabled={pending || cast.length === 0 || (aspect === "16:9" && !engineTakesBriefAspect())} className="h-[46px] rounded-[10px] bg-accent text-[15px] font-semibold text-accent-ink disabled:opacity-50">
        {pending ? "Saving…" : "Save show"}
      </button>
    </form>
  );
}

const TONES = ["Deadpan", "Wholesome", "Chaotic", "Dry"];
const input = "h-10 w-full rounded-lg border border-line bg-panel px-3 text-[14px] text-fg";
const chip = (on: boolean) => `h-9 rounded-lg border px-3 text-[13px] ${on ? "border-accent bg-accent-soft text-fg" : "border-line text-fg-2"}`;

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={chip(on)}>
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">{label}</span>
      {children}
    </div>
  );
}
