"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { clock } from "../edit/shared";
import { revokeAction, shareAction } from "./actions";

type Version = { id: string; number: number; createdAt: string; approvedBy: string | null; durationS: number };
type LinkRow = { id: string; token: string; versionId: string };
type Comment = { id: string; authorName: string; timecodeS: number; body: string; versionNumber: number; scenePosition: number | null; resolved: boolean };

export function ReviewOwner({
  projectId,
  versions,
  links,
  comments,
  changeStep = "edit",
}: {
  projectId: string;
  versions: Version[];
  links: LinkRow[];
  comments: Comment[];
  /** Where a comment becomes a change: the timeline (`edit`), or a revise of the skit (`script`). */
  changeStep?: "edit" | "script";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const latest = versions[0];
  const latestLink = latest ? links.find((l) => l.versionId === latest.id) : undefined;
  const open = comments.filter((c) => !c.resolved);
  const done = comments.filter((c) => c.resolved);
  const urlFor = (token: string) => `${window.location.origin}/r/${token}`;

  const share = () => start(async () => { setError(null); const r = await shareAction(projectId); if (r.ok) router.refresh(); else setError(r.error); });
  const copy = async (token: string) => { await navigator.clipboard.writeText(urlFor(token)); setCopied(token); setTimeout(() => setCopied(null), 2000); };

  return (
    <main className="mx-auto flex w-full max-w-[1040px] flex-1 gap-10 px-6 py-8 max-lg:flex-col">
      <section className="flex w-[380px] shrink-0 flex-col gap-4 max-lg:w-auto">
        <h1 className="font-display text-[32px] leading-tight">Share for review</h1>
        <p className="text-sm leading-relaxed text-fg-3">Send a link. Your client watches the film and leaves comments at the exact moment, with no account and no cost shown.</p>
        {latestLink ? (
          <div className="flex flex-col gap-2 rounded-xl border border-rule-2 bg-raised-2 p-4">
            <span className="text-xs text-fg-muted">Version {latest.number} · {clock(latest.durationS)}</span>
            <code title={`/r/${latestLink.token}`} className="truncate rounded-md bg-canvas px-2.5 py-2 font-mono text-xs text-fg-2">…/r/{latestLink.token.slice(0, 10)}…</code>
            <div className="flex gap-2">
              <button type="button" onClick={() => copy(latestLink.token)} className="h-9 flex-1 rounded-lg bg-accent text-[13px] font-semibold text-accent-ink">{copied === latestLink.token ? "Copied" : "Copy link"}</button>
              <button type="button" onClick={() => start(async () => { await revokeAction(projectId, latestLink.id); router.refresh(); })} className="h-9 rounded-lg border border-line px-3 text-[13px] text-fg-2">Stop sharing</button>
            </div>
            {latest.approvedBy && <span className="text-xs text-ready">Approved by {latest.approvedBy}</span>}
          </div>
        ) : (
          <button type="button" disabled={pending} onClick={share} className="h-11 rounded-lg bg-accent text-sm font-semibold text-accent-ink disabled:opacity-60">Create a review link</button>
        )}
        {latest && latestLink && <button type="button" onClick={share} className="text-left text-xs text-fg-muted">Changed something since? Share the latest edits — a new version gets its own link.</button>}
        {error && <p role="alert" className="text-[13px] text-attention">{error}</p>}
        <div className="mt-2 flex flex-col gap-1.5">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Versions</h2>
          {versions.length === 0 && <span className="text-[13px] text-fg-3">A version is saved the first time you share or export.</span>}
          {versions.map((v) => (
            <div key={v.id} className="flex justify-between text-[13px] text-fg-2"><span>Version {v.number}{v.approvedBy ? ` · approved by ${v.approvedBy}` : ""}</span><span className="num text-fg-muted">{clock(v.durationS)}</span></div>
          ))}
        </div>
      </section>

      <section aria-label="Comments" className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Needs you</h2><span className="num text-xs text-fg-muted">{open.length}</span></div>
        {open.length === 0 && <p className="text-[13px] text-fg-3">No comments waiting. They appear here as your client writes them.</p>}
        <ul className="flex flex-col gap-2">
          {open.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-xl border border-attention-line bg-attention-soft p-3.5">
              <div className="flex items-center gap-2 text-[13px]"><span className="font-medium">{c.authorName}</span><span className="num rounded bg-[#2a2414] px-2 py-0.5 text-[11px] text-attention">{clock(c.timecodeS)}</span>{c.scenePosition && <span className="text-xs text-fg-muted">scene {c.scenePosition}</span>}<span className="ml-auto text-xs text-fg-muted">v{c.versionNumber}</span></div>
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
    </main>
  );
}
