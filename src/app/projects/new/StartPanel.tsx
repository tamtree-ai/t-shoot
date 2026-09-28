"use client";

import { useState, useTransition } from "react";

import { parsePastedScript } from "@/lib/paste-script";
import { pasteClipsAction, pasteStickAction, topicsFromLinkAction } from "@/app/horizon-actions";

const tab = (on: boolean) => `h-9 rounded-lg border px-3 text-[13px] ${on ? "border-accent bg-accent-soft text-fg" : "border-line text-fg-2"}`;

export function StartPanel({
  mode,
  kind,
  characters,
  sets,
  limitUsd,
  showId,
  episodeNumber,
  onTopic,
}: {
  mode: "paste" | "link";
  kind: "stick_skit" | "ai_clips";
  characters: { id: string; name: string }[];
  sets: { id: string; label: string }[];
  limitUsd: string;
  showId?: string;
  episodeNumber?: number;
  onTopic: (topic: string) => void;
}) {
  const [script, setScript] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [setId, setSetId] = useState(sets[0]?.id ?? "plain-1");
  const [url, setUrl] = useState("");
  const [topics, setTopics] = useState<{ title: string; line: string }[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const parsed = mode === "paste" ? parsePastedScript(script) : null;

  function speakerMap(): Record<string, string> {
    const next = { ...mapping };
    for (const speaker of parsed?.speakers ?? []) {
      if (!next[speaker]) next[speaker] = characters[0]?.id ?? "milo";
    }
    return next;
  }

  return (
    <div className="flex flex-col gap-3">
      {mode === "paste" ? (
        <>
          <textarea
            aria-label="Paste a script"
            rows={8}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={'Person A: "You get $10."\nPerson B: That is not the deal.'}
            className="w-full rounded-xl border border-accent bg-panel px-[18px] py-4 text-[15px] text-fg"
          />
          {kind === "stick_skit" && parsed && parsed.speakers.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Who is speaking</span>
              {parsed.speakers.map((speaker) => (
                <label key={speaker} className="flex items-center justify-between gap-3 text-[13px]">
                  <span>{speaker}</span>
                  <select
                    aria-label={`${speaker} plays`}
                    value={speakerMap()[speaker]}
                    onChange={(e) => setMapping((m) => ({ ...m, [speaker]: e.target.value }))}
                    className="h-9 rounded-lg border border-line bg-panel px-2"
                  >
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          {kind === "stick_skit" && (
            <label className="flex items-center gap-2 text-[13px] text-fg-2">
              Set
              <select aria-label="Set" value={setId} onChange={(e) => setSetId(e.target.value)} className="h-9 rounded-lg border border-line bg-panel px-2">
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
          )}
          <p className="text-xs text-fg-muted">Parsing is free. It opens on the script. Nothing is voiced.</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = kind === "stick_skit"
                  ? await pasteStickAction({ script, mapping: speakerMap(), setId, limitUsd, showId, episodeNumber })
                  : await pasteClipsAction(script, limitUsd);
                if (result && !result.ok) setError(result.error);
              });
            }}
            className="h-11 w-fit rounded-md bg-accent px-5 text-[15px] font-semibold text-accent-ink"
          >
            {pending ? "Opening…" : "Open the script"}
          </button>
        </>
      ) : (
        <>
          <input
            aria-label="Link"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="h-12 rounded-xl border border-accent bg-panel px-4 text-[15px]"
          />
          <p className="text-xs text-fg-muted">Reading the link is about $0.01. You confirm before it runs.</p>
          <button
            type="button"
            disabled={pending || !url.trim()}
            onClick={() => {
              if (!window.confirm("Read this link · about $0.01?")) return;
              setError(null);
              startTransition(async () => {
                const result = await topicsFromLinkAction(url.trim());
                if (!result.ok) setError(result.error);
                else setTopics(result.topics);
              });
            }}
            className="h-11 w-fit rounded-md bg-accent px-5 text-[15px] font-semibold text-accent-ink"
          >
            {pending ? "Reading…" : "Read the link · $0.01"}
          </button>
          {topics && (
            <ul className="flex flex-col gap-2">
              {topics.map((topic) => (
                <li key={topic.title} className="rounded-lg border border-rule bg-panel p-3">
                  <p className="text-[15px]">{topic.title}</p>
                  <p className="mt-1 text-[13px] text-fg-muted">{topic.line}</p>
                  <div className="mt-2 flex gap-3 text-[13px]">
                    <button type="button" className="text-accent-link" onClick={() => onTopic(topic.title)}>Use this</button>
                    <button
                      type="button"
                      className="text-fg-3"
                      onClick={() => setPicked((p) => (p.includes(topic.title) ? p.filter((t) => t !== topic.title) : [...p, topic.title]))}
                    >
                      {picked.includes(topic.title) ? "Added" : "Add to the list"}
                    </button>
                  </div>
                </li>
              ))}
              {picked.length > 0 && <p className="text-[13px] text-fg-muted">{picked.length} selected. Open a show and paste them into Ideas.</p>}
            </ul>
          )}
        </>
      )}
      {error && <p role="alert" className="text-[13px] text-attention">{error}</p>}
    </div>
  );
}

export function StartTabs({ mode, onChange }: { mode: "topic" | "paste" | "link"; onChange: (mode: "topic" | "paste" | "link") => void }) {
  return (
    <div role="tablist" aria-label="How to start" className="flex gap-2">
      <button type="button" role="tab" aria-selected={mode === "topic"} className={tab(mode === "topic")} onClick={() => onChange("topic")}>Topic</button>
      <button type="button" role="tab" aria-selected={mode === "paste"} className={tab(mode === "paste")} onClick={() => onChange("paste")}>Paste a script</button>
      <button type="button" role="tab" aria-selected={mode === "link"} className={tab(mode === "link")} onClick={() => onChange("link")}>From a link</button>
    </div>
  );
}
