"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { saveShowAction } from "@/app/library-actions";

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
  const [template, setTemplate] = useState(defaultTemplate ?? "");
  const [cast, setCast] = useState<string[]>(defaultCast);
  const [setId, setSetId] = useState(defaultSet ?? "");
  const [tone, setTone] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [aiLine, setAiLine] = useState("Voices are AI-generated.");
  const [limit, setLimit] = useState(Number(cap).toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const result = await saveShowAction({
            name: name.trim(),
            ...(template ? { template } : {}),
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
        <input required value={name} onChange={(e) => setName(e.target.value)} className={input} />
      </Field>
      <Field label="Format">
        <select value={template} onChange={(e) => setTemplate(e.target.value)} className={input}>
          <option value="">Writer’s pick</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
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
              {characters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ))}
        </div>
      </Field>
      <Field label="Set">
        <select value={setId} onChange={(e) => setSetId(e.target.value)} className={input}>
          <option value="">Writer’s pick</option>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Tone">
        <input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="Deadpan" className={input} />
      </Field>
      <Field label="Hashtags">
        <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} className={input} />
      </Field>
      <Field label="AI line">
        <input value={aiLine} onChange={(e) => setAiLine(e.target.value)} className={input} />
      </Field>
      <Field label="Spend cap">
        <input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" className={input} />
      </Field>
      {error && <p className="text-[13px] text-attention">{error}</p>}
      <button type="submit" disabled={pending || cast.length === 0} className="h-11 rounded-lg bg-accent text-[14px] font-semibold text-accent-ink disabled:opacity-50">
        {pending ? "Saving…" : "Save show"}
      </button>
    </form>
  );
}

const input = "h-10 w-full rounded-lg border border-line bg-panel px-3 text-[14px] text-fg";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-fg-muted">
      {label}
      {children}
    </label>
  );
}
