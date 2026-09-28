"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { CastOnSet } from "@/components/stick-skit/Thumbs";
import { archiveProjectAction, deleteProjectAction, duplicateProjectAction, renameProjectAction, showVariationsAction, variationsAction } from "@/app/library-actions";
import type { LibraryRow } from "@/services/library";
import type { ShowRow } from "@/services/shows";

const STEPS = ["All steps", "Script", "Edit", "Review", "Export"] as const;

export function ProjectLibrary({ projects, shows, variationPrice, memberId }: { projects: LibraryRow[]; shows: ShowRow[]; variationPrice: number; memberId: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [step, setStep] = useState<(typeof STEPS)[number]>("All steps");
  const [needs, setNeeds] = useState(false);
  const [ready, setReady] = useState(false);
  const [archived, setArchived] = useState(false);
  const [mine, setMine] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const kinds = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.kind, p.kindLabel);
    return [...map.entries()];
  }, [projects]);

  const shown = projects.filter((p) => {
    if (p.archived && !archived && !q.trim()) return false;
    if (!p.archived && archived) return false;
    if (kind !== "all" && p.kind !== kind) return false;
    if (step !== "All steps" && p.step !== step) return false;
    if (needs && p.needsYou === 0) return false;
    if (ready && !p.readyToPost) return false;
    if (p.linked && !q.trim()) return false;
    if (mine && p.createdBy !== memberId && p.touchedById !== memberId) return false;
    const hay = `${p.title} ${p.lines}`.toLowerCase();
    return !q.trim() || hay.includes(q.trim().toLowerCase());
  });

  const ungrouped = shown.filter((p) => !p.showId);
  const price = variationPrice.toFixed(2);
  const filtering = Boolean(q.trim()) || kind !== "all" || step !== "All steps" || needs || ready || archived || mine;

  function clearFilters() {
    setQ("");
    setKind("all");
    setStep("All steps");
    setNeeds(false);
    setReady(false);
    setArchived(false);
    setMine(false);
  }

  async function run(id: string, work: () => Promise<{ ok: boolean; error?: string; id?: string }>) {
    setBusy(id);
    setError(null);
    const result = await work();
    setBusy(null);
    if (!result.ok) setError(result.error ?? "Something went wrong.");
    else router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[40px] leading-none">Projects</h1>
          <p className="mt-2 text-[13px] text-fg-muted">
            {shown.length} of {projects.length} {projects.length === 1 ? "short" : "shorts"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/shows/new" className="flex h-11 items-center rounded-md border border-line px-4 text-[14px] font-medium">
            New show
          </Link>
          <Link href="/projects/new" className="flex h-11 items-center rounded-md bg-accent px-5 text-[15px] font-semibold text-accent-ink">
            New short
          </Link>
        </div>
      </div>

      {shows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {shows.map((show) => (
            <li key={show.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-rule bg-panel px-4 py-3">
              <span className="min-w-0 flex-1 truncate font-display text-lg italic">{show.name}</span>
              <Link href={`/shows/${show.id}`} className="text-[13px] text-fg-2 hover:text-fg">Open</Link>
              <Link href={`/projects/new?type=stick_skit&show=${show.id}`} className="text-[13px] text-accent-link">
                New episode
              </Link>
              <button
                type="button"
                disabled={busy === show.id}
                onClick={() => {
                  const topic = window.prompt("What is this batch about?", show.name);
                  if (!topic) return;
                  if (!window.confirm(`Write 3 variations · up to $${price}. They stay archived until you open one. Nothing is voiced.`)) return;
                  void run(show.id, () => showVariationsAction(show.id, topic));
                }}
                className="text-[13px] text-fg-2"
              >
                3 variations · ${price}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 rounded-xl border border-rule bg-panel p-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles and lines" aria-label="Search projects" className="h-9 w-full rounded-lg bg-canvas px-3 text-[14px] text-fg placeholder:text-fg-muted" />
        <div className="flex flex-wrap items-center gap-1.5 border-t border-rule px-0.5 pt-2">
          <select aria-label="Project type" value={kind} onChange={(e) => setKind(e.target.value)} className={select}>
            <option value="all">All types</option>
            {kinds.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <select aria-label="Step" value={step} onChange={(e) => setStep(e.target.value as (typeof STEPS)[number])} className={select}>
            {STEPS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <span aria-hidden className="mx-1 hidden h-4 w-px bg-line sm:block" />
          <Filter on={needs} onClick={() => setNeeds((v) => !v)}>Needs you</Filter>
          <Filter on={ready} onClick={() => setReady((v) => !v)}>Ready to post</Filter>
          <Filter on={archived} onClick={() => setArchived((v) => !v)}>Archived</Filter>
          <Filter on={mine} onClick={() => setMine((v) => !v)}>Mine</Filter>
          {filtering && (
            <button type="button" onClick={clearFilters} className="h-8 rounded-md px-2 text-[13px] text-fg-3 hover:text-fg">
              Clear
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-[13px] text-attention">{error}</p>}

      <Section title={shows.length ? "Ungrouped" : undefined} rows={ungrouped} busy={busy} onRun={run} price={price} />
      {shows.map((show) => {
        const rows = shown.filter((p) => p.showId === show.id);
        if (rows.length === 0) return null;
        return <Section key={show.id} title={show.name} rows={rows} busy={busy} onRun={run} price={price} />;
      })}
    </div>
  );
}

const select = "h-8 rounded-md border border-line bg-canvas px-2 text-[13px] text-fg";

function Filter({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`h-8 rounded-md border px-2.5 text-[13px] ${on ? "border-accent bg-accent-soft text-fg" : "border-transparent text-fg-2 hover:bg-hover"}`}>
      {children}
    </button>
  );
}

function Section({ title, rows, busy, onRun, price }: { title?: string; rows: LibraryRow[]; busy: string | null; onRun: (id: string, work: () => Promise<{ ok: boolean; error?: string }>) => void; price: string }) {
  if (rows.length === 0 && title) return null;
  return (
    <section className="flex flex-col gap-2">
      {title && <h2 className="text-[13px] font-medium text-fg-muted">{title}</h2>}
      <ul className="overflow-hidden rounded-lg border border-rule-2 bg-panel">
        {rows.length === 0 && <li className="px-4 py-6 text-[13px] text-fg-3">Nothing matches.</li>}
        {rows.map((p) => (
          <Row key={p.id} project={p} busy={busy === p.id} price={price} onRun={onRun} />
        ))}
      </ul>
    </section>
  );
}

function Row({ project: p, busy, price, onRun }: { project: LibraryRow; busy: boolean; price: string; onRun: (id: string, work: () => Promise<{ ok: boolean; error?: string }>) => void }) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(p.title);
  return (
    <li className="border-b border-rule-2 last:border-b-0">
      <div className="flex items-center gap-3 px-3 py-3">
        <Thumb project={p} />
        <Link href={p.href} className="min-w-0 flex-1 hover:opacity-90">
          {renaming ? (
            <input
              value={title}
              aria-label="Project name"
              onClick={(e) => e.preventDefault()}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setRenaming(false);
                  onRun(p.id, () => renameProjectAction(p.id, title));
                }
              }}
              className="w-full rounded border border-line bg-canvas px-2 py-1 text-[16px]"
            />
          ) : (
            <span className="block truncate font-display text-xl text-fg italic">
              {p.episodeNumber ? `${p.episodeNumber}. ` : ""}
              {p.title}
            </span>
          )}
          <span className="mt-0.5 block text-xs text-fg-muted">
            {p.kindLabel}
            {p.needsYou > 0 ? ` · Needs you ${p.needsYou}` : ""}
            {p.origin === "assistant" ? " · assistant" : ""}
            {p.languages.length > 1 ? ` · ${p.languages.join(" · ")}` : ""}
            {p.views != null ? ` · ${p.views} views` : ""}
            {p.touchedBy ? ` · ${p.touchedBy}` : ""}
            {p.posts.length > 0 ? ` · ${p.posts.map((post) => post.label).join(", ")}` : ""}
          </span>
        </Link>
        <span className="w-16 shrink-0 text-[13px] text-fg-2">{p.step}</span>
        <time dateTime={p.updatedAt} className="num w-24 shrink-0 text-right text-xs text-fg-muted">{ago(p.updatedAt)}</time>
        <details className="relative">
          <summary className="cursor-pointer list-none rounded px-2 py-1 text-[12px] text-fg-3 hover:bg-hover">More</summary>
          <div className="absolute right-0 z-10 mt-1 flex w-44 flex-col rounded-lg border border-rule bg-panel p-1 text-[13px] shadow-lg">
            <button type="button" className="rounded px-2 py-1.5 text-left hover:bg-hover" onClick={() => setRenaming(true)}>Rename</button>
            <button type="button" disabled={busy} className="rounded px-2 py-1.5 text-left hover:bg-hover" onClick={() => onRun(p.id, () => duplicateProjectAction(p.id))}>Duplicate</button>
            {p.kind === "stick_skit" && (
              <button
                type="button"
                disabled={busy}
                className="rounded px-2 py-1.5 text-left hover:bg-hover"
                onClick={() => {
                  if (!window.confirm(`Write 3 variations · up to $${price}. They stay archived until you open one.`)) return;
                  onRun(p.id, () => variationsAction(p.id));
                }}
              >
                3 variations
              </button>
            )}
            <button type="button" className="rounded px-2 py-1.5 text-left hover:bg-hover" onClick={() => onRun(p.id, () => archiveProjectAction(p.id, !p.archived))}>{p.archived ? "Unarchive" : "Archive"}</button>
            <button
              type="button"
              className="rounded px-2 py-1.5 text-left text-attention hover:bg-hover"
              onClick={() => {
                if (!window.confirm(`Delete “${p.title}”? This cannot be undone.`)) return;
                onRun(p.id, () => deleteProjectAction(p.id));
              }}
            >
              Delete
            </button>
          </div>
        </details>
      </div>
    </li>
  );
}

function Thumb({ project }: { project: LibraryRow }) {
  if (project.thumb.kind === "stick") {
    return <CastOnSet setId={project.thumb.setId} characterIds={project.thumb.characters} className="h-14 w-10 shrink-0 rounded-md border border-line" />;
  }
  if (project.thumb.kind === "clips") {
    return (
      <span className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md border border-line" style={{ background: project.thumb.gradient }}>
        {project.thumb.assetId && <video src={`/api/media/${project.thumb.assetId}#t=0.2`} muted playsInline preload="metadata" className="h-full w-full object-cover" />}
      </span>
    );
  }
  return <span className="h-14 w-10 shrink-0 rounded-md bg-panel" />;
}

function ago(iso: string): string {
  const when = new Date(iso);
  const s = Math.max(0, Math.round((Date.now() - when.getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} d ago`;
  return when.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
