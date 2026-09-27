"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { displayTitle } from "@/lib/display-title";

export type LibraryProject = {
  id: string;
  title: string;
  kindLabel: string;
  kind: string;
  stepLabel: string;
  href: string;
  ago: string;
  updatedAt: string;
};

export function ProjectLibrary({ projects }: { projects: LibraryProject[] }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const kinds = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.kind, p.kindLabel);
    return [...map.entries()];
  }, [projects]);
  const shown = projects.filter((p) => {
    if (kind !== "all" && p.kind !== kind) return false;
    const title = displayTitle(p.title).toLowerCase();
    return !q.trim() || title.includes(q.trim().toLowerCase());
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[40px] leading-none">Projects</h1>
          <p className="mt-2 text-[13px] text-fg-muted">
            {shown.length} of {projects.length} {projects.length === 1 ? "short" : "shorts"}
          </p>
        </div>
        <Link href="/projects/new" className="flex h-11 shrink-0 items-center rounded-md bg-accent px-5 text-[15px] font-semibold text-accent-ink">
          New short
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles"
          aria-label="Search projects"
          className="h-10 min-w-[200px] flex-1 rounded-lg border border-line bg-panel px-3 text-[14px] text-fg placeholder:text-fg-muted"
        />
        <select aria-label="Project type" value={kind} onChange={(e) => setKind(e.target.value)} className="h-10 rounded-lg border border-line bg-panel px-2 text-[13px]">
          <option value="all">All types</option>
          {kinds.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <ul className="overflow-hidden rounded-lg border border-rule-2 bg-panel">
        {shown.length === 0 && <li className="px-4 py-6 text-[13px] text-fg-3">Nothing matches.</li>}
        {shown.map((p) => (
          <li key={p.id} className="border-b border-rule-2 last:border-b-0">
            <Link href={p.href} className="flex items-center gap-4 px-4 py-3.5 hover:bg-hover">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-xl text-fg italic">{displayTitle(p.title)}</span>
                <span className="mt-0.5 block text-xs text-fg-muted">{p.kindLabel}</span>
              </span>
              <span className="w-16 shrink-0 text-[13px] text-fg-2">{p.stepLabel}</span>
              <time dateTime={p.updatedAt} className="num w-24 shrink-0 text-right text-xs text-fg-muted">
                {p.ago}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
