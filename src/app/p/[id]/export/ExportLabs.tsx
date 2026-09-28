"use client";

import { useState, useTransition } from "react";

import { chooseTitleAction, titlesAction, translateAction } from "@/app/horizon-actions";
import { LANGUAGES } from "@/lib/languages";
import { youtubeTitleTest } from "@/lib/youtube-test";

const COVER = { opening: "Opening frame", slam: "Text slam", end: "End card" } as const;

export function ExportLabs({ projectId, title, lineCount }: { projectId: string; title: string; lineCount: number }) {
  const [pairs, setPairs] = useState<{ title: string; cover: "opening" | "slam" | "end" }[] | null>(null);
  const [language, setLanguage] = useState("es");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const test = youtubeTitleTest();
  const each = (0.01 + lineCount * 0.0015).toFixed(2);

  return (
    <div className="flex flex-col gap-3 px-5 pb-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Three titles · about $0.01?")) return;
            startTransition(async () => {
              const result = await titlesAction(projectId, title, []);
              if (!result.ok) setError(result.error);
              else setPairs(result.pairs);
            });
          }}
          className="h-8 rounded-lg border border-line px-3 text-[13px]"
        >
          Titles · $0.01
        </button>
        <label className="flex items-center gap-2 text-[13px] text-fg-2">
          Make it in another language
          <select aria-label="Language" value={language} onChange={(e) => setLanguage(e.target.value)} className="h-8 rounded-lg border border-line bg-panel px-2">
            {LANGUAGES.filter((l) => l.id !== "en").map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`${LANGUAGES.find((l) => l.id === language)?.label} · about $${each}? It needs its own approval.`)) return;
              startTransition(async () => {
                const result = await translateAction(projectId, language);
                if (result && !result.ok) setError(result.error);
              });
            }}
            className="h-8 rounded-lg bg-accent px-3 font-semibold text-accent-ink"
          >
            About ${each}
          </button>
        </label>
      </div>
      {pairs && (
        <ul className="flex flex-col gap-2">
          {pairs.map((pair) => (
            <li key={pair.title} className="flex items-center justify-between gap-3 rounded-lg border border-rule px-3 py-2">
              <span>
                <span className="text-[14px]">{pair.title}</span>
                <span className="ml-2 text-[12px] text-fg-muted">{COVER[pair.cover]}</span>
              </span>
              <button type="button" className="text-[13px] text-accent-link" onClick={() => startTransition(async () => { await chooseTitleAction(projectId, pair.title); })}>
                Use this
              </button>
            </li>
          ))}
          <p className="text-[12px] text-fg-muted">{test.available ? "YouTube testing is on." : test.reason}</p>
        </ul>
      )}
      {error && <p role="alert" className="text-[13px] text-attention">{error}</p>}
    </div>
  );
}
