"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { BrandFrame } from "@/components/BrandFrame";
import { fitFrame } from "@/components/stick-skit/fit";
import { ASPECT_LABEL, aspectOfSize, FRAME, type Aspect } from "@/lib/stick/frame";
import type { BrandKit } from "@/lib/brand";
import { useElementSize } from "@/components/stick-skit/useElementSize";
import { ExportLabs } from "./ExportLabs";
import { PublishDesk } from "./PublishDesk";
import type { StoredPost } from "@/types/social/post";

export type ExportCut = {
  id: string;
  number: number;
  createdAt: string;
  approvedBy: string | null;
  durationS: number;
  mp4: string;
  srt: string;
  txt: string;
  /** The compiler's cover. Scrubbing the film stays the override. */
  cover?: string;
  thumbnail?: string;
  reminder?: string;
  reviewUrl: string | null;
  /** The cut's frame. The file's pixels replace this once they load. */
  aspect?: Aspect;
};

function aiVoice(consent: boolean): string {
  return consent
    ? "Voices are AI-generated (text-to-speech). The owner's voice was cloned with their consent."
    : "Voices are AI-generated (text-to-speech).";
}
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function parsePost(text: string, consent: boolean): { caption: string; hashtags: string; disclosure: string } {
  const head = text.split(/\n---\n/)[0] ?? text;
  const blocks = head.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
  const hashtags = blocks.find((b) => b.split(/\s+/).every((w) => w.startsWith("#"))) ?? "";
  const disclosure = blocks.find((b) => b.includes("AI-generated")) ?? aiVoice(consent);
  const caption = blocks.find((b) => b !== hashtags && b !== disclosure) ?? "";
  return { caption, hashtags, disclosure };
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StickSkitExportStudio({ projectId, title, cuts, posts, lineCount = 1, brand, voiceConsent = false }: { projectId: string; title: string; cuts: ExportCut[]; posts: StoredPost[]; lineCount?: number; brand?: BrandKit | null; voiceConsent?: boolean }) {
  const [id, setId] = useState(cuts[0]?.id ?? "");
  const cut = cuts.find((c) => c.id === id) ?? cuts[0];
  const video = useRef<HTMLVideoElement>(null);
  const [stage, stageSize] = useElementSize();
  const [postFor, setPostFor] = useState<{ id: string; caption: string; hashtags: string; disclosure: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [specsFor, setSpecsFor] = useState<{ id: string; w: number; h: number; bytes: number | null } | null>(null);
  const post = postFor?.id === cut?.id ? postFor : null;
  const specs = specsFor?.id === cut?.id ? specsFor : null;
  const ratio: Aspect = specs && specs.w > 0 && specs.h > 0 ? aspectOfSize(specs.w, specs.h) : (cut?.aspect ?? "9:16");
  const fitted = fitFrame(stageSize.width, stageSize.height, ratio);

  useEffect(() => {
    if (!cut) return;
    let cancel = false;
    const cutId = cut.id;
    void fetch(cut.txt)
      .then((r) => (r.ok ? r.text() : ""))
      .then((text) => {
        if (!cancel && text) setPostFor({ id: cutId, ...parsePost(text, voiceConsent) });
      })
      .catch(() => {});
    void fetch(cut.mp4, { headers: { Range: "bytes=0-0" } })
      .then((r) => {
        const total = r.headers.get("content-range")?.split("/")[1];
        const n = total ? Number(total) : Number(r.headers.get("content-length"));
        if (!cancel && Number.isFinite(n) && n > 0) {
          const fallback = FRAME[cut.aspect ?? "9:16"];
          setSpecsFor((s) => ({ id: cutId, w: s?.id === cutId ? s.w : fallback.width, h: s?.id === cutId ? s.h : fallback.height, bytes: n }));
        }
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [cut]);

  const copy = async (key: string, value: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1600);
  };

  const cover = () => {
    const el = video.current;
    if (!el || !el.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(el, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}-v${cut?.number ?? 1}-cover.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/jpeg", 0.92);
  };

  if (!cut) {
    return (
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-4 px-6 py-10">
        <h1 className="font-display text-[36px] leading-tight">Export</h1>
        <p className="text-[15px] text-fg-2">No video yet. Approve the skit to make one.</p>
        <Link href={`/p/${projectId}/script`} className="self-start rounded-lg border border-line-strong bg-[#222227] px-4 py-2 text-[13px] font-medium">
          Back to the skit
        </Link>
      </main>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-col gap-2 px-5 pt-4">
          <div className="flex items-end justify-between gap-3">
          <h1 className="font-display text-[32px] leading-none">Export</h1>
          {cuts.length > 1 && (
            <select aria-label="Version" value={cut.id} onChange={(e) => setId(e.target.value)} className="h-8 rounded-lg border border-line bg-panel px-2 text-[13px]">
              {cuts.map((c) => (
                <option key={c.id} value={c.id}>
                  Version {c.number}
                </option>
              ))}
            </select>
          )}
          </div>
          <ExportLabs projectId={projectId} title={title} lineCount={lineCount} />
        </div>
        <div ref={stage} className="relative min-h-0 flex-1">
          <div className="absolute inset-0 flex items-center justify-center">
            {fitted.width > 0 && (
              <BrandFrame brand={brand}>
              <video
                key={cut.mp4}
                ref={video}
                src={cut.mp4}
                controls
                playsInline
                preload="metadata"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  setSpecsFor((s) => ({ id: cut.id, w: v.videoWidth || FRAME[cut.aspect ?? "9:16"].width, h: v.videoHeight || FRAME[cut.aspect ?? "9:16"].height, bytes: s?.id === cut.id ? s.bytes : null }));
                }}
                style={{ width: fitted.width, height: fitted.height }}
                className="bg-black object-contain"
              />
              </BrandFrame>
            )}
          </div>
        </div>
        <p className="px-5 pb-3 text-[12px] text-fg-muted">
          {specs ? `${specs.w}×${specs.h}` : `${FRAME[ratio].width}×${FRAME[ratio].height}`} · {ASPECT_LABEL[ratio]} · {clock(cut.durationS)} · version {cut.number}
          {specs?.bytes ? ` · ${fileSize(specs.bytes)}` : ""}
          {cut.approvedBy ? ` · approved by ${cut.approvedBy}` : ""}
        </p>
        {ratio === "16:9" && (
          <p className="px-5 pb-3 text-[12px] text-fg-muted">TikTok and Instagram are built for a vertical short. This cut is widescreen, so YouTube is the one that fits.</p>
        )}
      </section>

      <aside className="flex w-[380px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-rule-2 bg-panel-2 px-5 py-5">
        <div className="flex flex-wrap gap-2">
          <a href={cut.mp4} className="flex h-10 items-center rounded-lg bg-accent px-4 text-[13px] font-semibold text-accent-ink">
            Download MP4
          </a>
          <a href={cut.srt} className="flex h-10 items-center rounded-lg border border-line px-3 text-[13px] font-medium">
            Captions
          </a>
          <a href={cut.txt} className="flex h-10 items-center rounded-lg border border-line px-3 text-[13px] font-medium">
            Post text
          </a>
        </div>
        <div className="flex flex-col gap-2">
          <CopyButton label="Copy caption" done={copied === "caption"} disabled={!post?.caption} onClick={() => post && copy("caption", post.caption)} />
          <CopyButton label="Copy hashtags" done={copied === "tags"} disabled={!post?.hashtags} onClick={() => post && copy("tags", post.hashtags)} />
          <CopyButton label="Copy AI-voice line" done={copied === "ai"} onClick={() => copy("ai", post?.disclosure || aiVoice(voiceConsent))} />
          {cut.cover && <Image src={cut.cover} alt="Generated cover" width={112} height={199} unoptimized className="w-28 rounded-lg border border-rule" />}
          <CopyButton label={cut.cover ? "Use a different frame" : "Save cover frame"} done={false} onClick={cover} />
          {cut.reviewUrl ? (
            <CopyButton label="Copy review link" done={copied === "link"} onClick={() => copy("link", cut.reviewUrl!)} />
          ) : (
            <Link href={`/p/${projectId}/review`} className="flex h-10 items-center justify-center rounded-lg border border-line text-[13px] font-medium">
              Share for review
            </Link>
          )}
        </div>
        {post?.caption && <p className="rounded-lg border border-rule bg-panel px-3 py-2 text-[13px] leading-snug text-fg-2">{post.caption}</p>}
        {post?.hashtags && <p className="font-mono text-[12px] text-fg-3">{post.hashtags}</p>}
        {cut.reminder && <p className="text-[13px] text-attention">{cut.reminder}</p>}
        <p className="text-[12px] leading-relaxed text-fg-muted">{cut.cover ? "The generated cover is the default. Scrub the film and save a frame only when you want a different one." : "Scrub the film and save the frame you want as the cover. A generated cover replaces this once the render includes one."}</p>
        {cut && (
          <PublishDesk
            key={`${cut.id}:${post?.caption ?? ""}`}
            projectId={projectId}
            versionId={cut.id}
            seed={{ title, description: post?.caption ?? "", hashtags: post?.hashtags ?? "" }}
            stored={posts}
          />
        )}

        <h2 className="mt-2 text-[11px] font-semibold tracking-[0.08em] text-fg-muted uppercase">Versions</h2>
        <ul className="flex flex-col divide-y divide-rule-2 rounded-xl border border-rule-2">
          {cuts.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setId(c.id)} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] ${c.id === cut.id ? "bg-hover" : ""}`}>
                <span className="font-medium">Version {c.number}</span>
                <span className="num text-fg-muted">{clock(c.durationS)}</span>
                <span className="text-fg-muted">{new Date(c.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function CopyButton({ label, done, disabled, onClick }: { label: string; done: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="flex h-10 items-center justify-center rounded-lg border border-line bg-hover px-3 text-[13px] font-medium disabled:opacity-40">
      {done ? "Copied" : label}
    </button>
  );
}
