"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { fit916 } from "@/components/stick-skit/fit";
import { useElementSize } from "@/components/stick-skit/useElementSize";
import { clock } from "../edit/shared";
import { revokeAction, shareAction } from "./actions";

type Version = { id: string; number: number; createdAt: string; approvedBy: string | null; durationS: number };
type LinkRow = { id: string; token: string; versionId: string };
type Comment = { id: string; authorName: string; timecodeS: number; body: string; versionNumber: number; scenePosition: number | null; resolved: boolean };
export type ReviewFilm = { id: string; number: number; durationS: number; src: string };

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function ReviewOwner({
  projectId,
  versions,
  links,
  comments,
  films = [],
  changeStep = "edit",
}: {
  projectId: string;
  versions: Version[];
  links: LinkRow[];
  comments: Comment[];
  films?: ReviewFilm[];
  /** Where a comment becomes a change: the timeline (`edit`), or a revise of the skit (`script`). */
  changeStep?: "edit" | "script";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [filmId, setFilmId] = useState(films[0]?.id ?? "");
  const [t, setT] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const [stage, stageSize] = useElementSize();
  const fitted = fit916(stageSize.width, stageSize.height);

  const film = films.find((f) => f.id === filmId) ?? films[0];
  const latest = versions[0];
  const shownVersion = film ? versions.find((v) => v.id === film.id) ?? latest : latest;
  const shownLink = shownVersion ? links.find((l) => l.versionId === shownVersion.id) : undefined;
  const open = comments.filter((c) => !c.resolved);
  const done = comments.filter((c) => c.resolved);
  const urlFor = (token: string) => `${window.location.origin}/r/${token}`;

  const share = () => start(async () => { setError(null); const r = await shareAction(projectId); if (r.ok) router.refresh(); else setError(r.error); });
  const copy = async (token: string) => { await navigator.clipboard.writeText(urlFor(token)); setCopied(token); setTimeout(() => setCopied(null), 2000); };
  const seek = (s: number) => {
    setT(s);
    if (video.current) video.current.currentTime = s;
  };

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
        {film ? (
          <>
            <div className="flex items-center gap-3 px-4 pt-3">
              <h1 className="font-display text-[28px] leading-none">Review</h1>
              {films.length > 1 && (
                <select aria-label="Version" value={film.id} onChange={(e) => { setFilmId(e.target.value); setT(0); }} className="h-8 rounded-lg border border-line bg-panel px-2 text-[13px]">
                  {films.map((f) => <option key={f.id} value={f.id}>Version {f.number}</option>)}
                </select>
              )}
              <span className="text-xs text-fg-muted">{film ? `Version ${film.number} · ${clock(film.durationS)}` : ""}</span>
            </div>
            <div ref={stage} className="relative min-h-0 flex-1">
              <div className="absolute inset-0 flex items-center justify-center">
                {fitted.width > 0 && (
                  <video
                    key={film.src}
                    ref={video}
                    src={film.src}
                    playsInline
                    controls
                    preload="metadata"
                    onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
                    style={{ width: fitted.width, height: fitted.height }}
                    className="bg-black object-contain"
                  />
                )}
              </div>
            </div>
            <div className="px-4 pt-2 pb-3">
              <div className="relative h-3">
                {comments.filter((c) => !film || c.versionNumber === film.number).map((c) => (
                  <button key={c.id} type="button" aria-label={`Comment at ${fmt(c.timecodeS)}`} onClick={() => seek(c.timecodeS)} className="absolute top-0 size-2.5 -translate-x-1/2 rounded-full bg-attention" style={{ left: `${(c.timecodeS / film.durationS) * 100}%` }} />
                ))}
              </div>
              <p className="text-[12px] text-fg-muted">{fmt(t)} / {fmt(film.durationS)} · dots are comments</p>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col justify-center px-8">
            <h1 className="font-display text-[32px] leading-tight">Share for review</h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-fg-3">A version appears here once the film has been made. Until then, share a link and your client watches it with no account.</p>
          </div>
        )}
      </section>

      <aside className="flex w-[380px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-rule-2 bg-panel-2 px-5 py-5">
        <div>
          <h2 className="text-sm font-semibold">{film ? "Share" : "Share for review"}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-3">Your client watches the film and leaves comments at the exact moment, with no account and no cost shown.</p>
        </div>
        {shownLink ? (
          <div className="flex flex-col gap-2 rounded-xl border border-rule-2 bg-raised-2 p-4">
            <span className="text-xs text-fg-muted">Version {shownVersion?.number} · {shownVersion ? clock(shownVersion.durationS) : ""}</span>
            <code className="truncate rounded-md bg-canvas px-2.5 py-2 font-mono text-xs text-fg-2">…/r/{shownLink.token.slice(0, 10)}…</code>
            <div className="flex gap-2">
              <button type="button" onClick={() => copy(shownLink.token)} className="h-9 flex-1 rounded-lg bg-accent text-[13px] font-semibold text-accent-ink">{copied === shownLink.token ? "Copied" : "Copy link"}</button>
              <button type="button" onClick={() => start(async () => { await revokeAction(projectId, shownLink.id); router.refresh(); })} className="h-9 rounded-lg border border-line px-3 text-[13px] text-fg-2">Stop sharing</button>
            </div>
            {shownVersion?.approvedBy && <span className="text-xs text-ready">Approved by {shownVersion.approvedBy}</span>}
          </div>
        ) : (
          <button type="button" disabled={pending || !latest} onClick={share} className="h-11 rounded-lg bg-accent text-sm font-semibold text-accent-ink disabled:opacity-60">Create a review link</button>
        )}
        {latest && shownLink && <button type="button" onClick={share} className="text-left text-xs text-fg-muted">Changed something since? Share the latest edits — a new version gets its own link.</button>}
        {error && <p role="alert" className="text-[13px] text-attention">{error}</p>}

        <section aria-label="Comments" className="flex flex-col gap-2">
          <div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Needs you</h2><span className="num text-xs text-fg-muted">{open.length}</span></div>
          {open.length === 0 && <p className="text-[13px] text-fg-3">No comments waiting.</p>}
          <ul className="flex flex-col gap-2">
            {open.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 rounded-xl border border-attention-line bg-attention-soft p-3.5">
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="font-medium">{c.authorName}</span>
                  <button type="button" onClick={() => seek(c.timecodeS)} className="num rounded bg-[#2a2414] px-2 py-0.5 text-[11px] text-attention">{clock(c.timecodeS)}</button>
                  {c.scenePosition && <span className="text-xs text-fg-muted">scene {c.scenePosition}</span>}
                  <span className="ml-auto text-xs text-fg-muted">v{c.versionNumber}</span>
                </div>
                <p className="text-sm leading-normal text-fg">{c.body}</p>
                <Link href={`/p/${projectId}/${changeStep}?change=${c.id}`} className="self-start rounded-lg border border-line-strong bg-[#222227] px-3 py-1.5 text-[13px] font-medium">Turn into a change</Link>
              </li>
            ))}
          </ul>
          {done.length > 0 && (
            <details className="text-[13px] text-fg-3"><summary className="cursor-pointer">{done.length} turned into changes</summary>
              <ul className="mt-2 flex flex-col gap-1.5">{done.map((c) => <li key={c.id} className="text-fg-muted">{c.authorName} · {clock(c.timecodeS)} — {c.body}</li>)}</ul>
            </details>
          )}
        </section>

        <div className="mt-auto flex flex-col gap-1.5">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Versions</h2>
          {versions.length === 0 && <span className="text-[13px] text-fg-3">A version is saved the first time you share or export.</span>}
          {versions.map((v) => (
            <button key={v.id} type="button" onClick={() => films.some((f) => f.id === v.id) && setFilmId(v.id)} className="flex justify-between text-left text-[13px] text-fg-2">
              <span>Version {v.number}{v.approvedBy ? ` · approved by ${v.approvedBy}` : ""}</span>
              <span className="num text-fg-muted">{clock(v.durationS)}</span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
