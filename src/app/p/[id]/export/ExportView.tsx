"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import type { getExportModel } from "@/services/export";
import type { StoredPost } from "@/types/social/post";
import { clock } from "../edit/shared";
import { renderAction } from "./actions";
import { PublishDesk } from "./PublishDesk";

type Model = NonNullable<Awaited<ReturnType<typeof getExportModel>>>;

export function ExportView({ model, pack }: { model: Model; pack?: { caption: string; hashtags: string; aiLine: string; posts: StoredPost[] } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const latest = model.versions[0];
  const ready = !!latest?.renderAssetId;
  const pid = model.project.id;

  useEffect(() => {
    if (!model.rendering) return;
    const id = setInterval(() => router.refresh(), 1500);
    return () => clearInterval(id);
  }, [model.rendering, router]);

  const render = () => start(async () => { setError(null); const r = await renderAction(pid); if (r.ok) router.refresh(); else setError(r.error); });

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="font-display text-[36px] leading-tight">Export</h1>

      <section className="flex flex-col gap-4 rounded-[14px] border border-rule-2 bg-raised-2 p-6">
        {!model.canExport ? (
          <>
            <p className="text-[15px] text-fg-2">This video isn’t ready to export yet.</p>
            <p className="text-[13px] text-attention">{model.blockedReason}</p>
            <Link href={`/p/${pid}/edit`} className="self-start rounded-lg border border-line-strong bg-[#222227] px-4 py-2 text-[13px] font-medium">Back to Edit</Link>
          </>
        ) : model.rendering ? (
          <p role="status" className="flex items-center gap-2 text-[15px]"><span className="size-1.5 rounded-full bg-accent" />Rendering your video…</p>
        ) : ready ? (
          <>
            <p className="flex items-center gap-2 text-[15px]"><span className="size-1.5 rounded-full bg-ready" />Version {latest.number} is ready · <span className="num">{clock(latest.durationS)}</span></p>
            <div className="flex gap-2.5">
              <a href={`/api/media/${latest.renderAssetId}?name=${encodeURIComponent(model.project.title)}-v${latest.number}.mp4`} className="flex h-11 items-center rounded-lg bg-accent px-5 text-sm font-semibold text-accent-ink">Download MP4</a>
              <Link href={`/p/${pid}/review`} className="flex h-11 items-center rounded-lg border border-line px-4 text-sm font-medium text-fg-2">Share for review</Link>
            </div>
          </>
        ) : (
          <>
            <p className="text-[15px] text-fg-2">Every scene is ready. Rendering the final video is free.</p>
            {model.renderFailed && <p role="alert" className="text-[13px] text-attention">Something went wrong on our side. Try again.</p>}
            <button type="button" disabled={pending} onClick={render} className="flex h-11 items-center justify-center gap-2.5 self-start rounded-lg bg-accent px-5 text-sm font-semibold text-accent-ink disabled:opacity-60">Render final video<span className="num text-[13px] font-medium">free</span></button>
          </>
        )}
        {error && <p role="alert" className="text-[13px] text-attention">{error}</p>}
        {pack && (
          <div className="flex flex-col gap-2 border-t border-rule pt-4">
            <CopyLine label="Copy caption" value={pack.caption} />
            <CopyLine label="Copy hashtags" value={pack.hashtags} />
            <CopyLine label="Copy AI-voice line" value={pack.aiLine} />
            {pack.caption && <p className="text-[13px] leading-snug text-fg-2">{pack.caption}</p>}
            {latest?.renderAssetId && (
              <PublishDesk projectId={pid} versionId={latest.id} seed={{ title: model.project.title, description: pack.caption, hashtags: pack.hashtags }} stored={pack.posts} />
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Versions</h2>
        <p className="text-xs text-fg-muted">Each version is a saved copy of the film exactly as it was. Downloading an old one doesn’t render it again.</p>
        {model.versions.length === 0 && <p className="text-[13px] text-fg-3">No versions yet.</p>}
        <ul className="flex flex-col divide-y divide-rule-2 rounded-xl border border-rule-2">
          {model.versions.map((v) => (
            <li key={v.id} className="flex items-center gap-3 px-4 py-3 text-[13px]">
              <span className="font-medium">Version {v.number}</span>
              <span className="num text-fg-muted">{clock(v.durationS)}</span>
              <span className="text-fg-muted">{new Date(v.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span>
              {v.approvedBy && <span className="text-ready">Approved by {v.approvedBy}</span>}
              {v.renderAssetId ? <a href={`/api/media/${v.renderAssetId}?name=${encodeURIComponent(model.project.title)}-v${v.number}.mp4`} className="ml-auto text-accent-link">Download</a> : <span className="ml-auto text-fg-muted">Not rendered</span>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      disabled={!value}
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className="flex h-10 items-center justify-center rounded-lg border border-line text-[13px] font-medium disabled:opacity-40"
    >
      {done ? "Copied" : label}
    </button>
  );
}
