"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { gradientFor } from "../../p/[id]/edit/shared";
import type { ReviewView } from "@/services/review";
import { approveAction, commentAction } from "./actions";

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const NAME_KEY = "tamshoot.reviewer";

/** The client's page (Review.dc.html): the film, a scrubber with comment dots, comments, two buttons. No cost, no traces (OD-8). */
export function ClientReview({ token, review }: { token: string; review: ReviewView }) {
  const router = useRouter();
  const tl = review.timeline;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [name, setName] = useState(() => { try { return typeof window === "undefined" ? "" : (localStorage.getItem(NAME_KEY) ?? ""); } catch { return ""; } });
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setT((x) => { const n = x + 0.1; if (n >= tl.duration_s) { setPlaying(false); return tl.duration_s; } return n; }), 100);
    return () => clearInterval(id);
  }, [playing, tl.duration_s]);

  let acc = 0;
  const idx = Math.max(0, tl.scenes.findIndex((s) => { const hit = t < acc + s.length_s; acc += s.length_s; return hit; }));
  const scene = tl.scenes[idx] ?? tl.scenes.at(-1)!;
  const sceneStart = tl.scenes.slice(0, idx).reduce((n, s) => n + s.length_s, 0);
  const local = t - sceneStart;
  const cap = scene.captions.find((c) => local >= c.start_s && local < c.end_s) ?? scene.captions.at(-1);

  const remember = (n: string) => { setName(n); try { localStorage.setItem(NAME_KEY, n); } catch {} };
  const post = () => start(async () => {
    setError(null);
    const r = await commentAction(token, name, t, body);
    if (r.ok) { setBody(""); router.refresh(); } else setError(r.error);
  });
  const approve = () => start(async () => {
    setError(null);
    if (!name.trim()) { setError("Add your name to approve."); return; }
    const r = await approveAction(token, name);
    if (r.ok) router.refresh(); else setError(r.error);
  });

  return (
    <div className="flex min-h-screen flex-col bg-canvas-script">
      <header className="flex flex-wrap items-center gap-4 border-b border-rule-2 px-6 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-2xl leading-none italic">{review.projectTitle}</span>
          <span className="text-xs text-fg-muted">Shared by {review.sharedBy} for your review · version {review.versionNumber} · {Math.round(tl.duration_s)} seconds</span>
        </div>
        <div className="flex-1" />
        <button type="button" onClick={() => { box.current?.focus(); }} className="h-10 rounded-lg border border-line-strong bg-hover px-4 text-sm font-medium">Request changes</button>
        {review.approvedBy ? (
          <span className="flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm text-ready">Approved by {review.approvedBy}</span>
        ) : (
          <button type="button" disabled={pending} onClick={approve} className="flex h-10 items-center gap-2 rounded-lg bg-accent px-[18px] text-sm font-semibold text-accent-ink disabled:opacity-60">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Approve
          </button>
        )}
      </header>

      <div className="flex flex-1 max-lg:flex-col">
        <main className="flex flex-1 flex-col items-center gap-3 px-4 py-5 sm:px-10" style={{ background: "radial-gradient(circle at 50% 40%, #15151a 0%, #0a0a0c 70%)" }}>
          <div role="img" aria-label="Phone preview" className="relative box-border h-[648px] w-[352px] max-w-full shrink-0 rounded-[50px] bg-[#050506] p-[11px] shadow-[0_0_0_1px_#3a3a42,inset_0_0_0_1px_rgba(255,255,255,0.05),0_30px_80px_rgba(0,0,0,0.6)] max-sm:h-[560px] max-sm:w-[304px]">
            <div className="absolute top-[22px] left-1/2 z-[2] h-7 w-[94px] -translate-x-1/2 rounded-[14px] bg-black" />
            <div className="relative h-full w-full overflow-hidden rounded-[40px]" style={{ background: gradientFor(scene.position) }}>
              <div className="absolute inset-0 flex items-center justify-center p-10 text-center text-[13px] leading-normal text-white/40">[footage — scene {scene.position}]</div>
              {cap && <div className="absolute right-6 bottom-[130px] left-6 text-center text-[27px] leading-[1.2] font-bold tracking-[-0.01em] text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.55)]">{cap.text}</div>}
            </div>
          </div>

          <div className="flex w-full max-w-[640px] flex-col gap-2">
            <div className="relative h-4">
              <input type="range" min={0} max={Math.round(tl.duration_s * 10)} value={Math.round(t * 10)} onChange={(e) => { setPlaying(false); setT(Number(e.target.value) / 10); }} aria-label={`Playhead, ${fmt(t)} of ${fmt(tl.duration_s)}`} className="absolute top-0 left-0 m-0 h-4 w-full accent-accent" />
            </div>
            <div className="relative h-3" aria-hidden>
              {review.comments.map((c) => <span key={c.id} className="absolute top-0.5 size-2 rounded-full bg-attention" style={{ left: `${(c.timecodeS / tl.duration_s) * 100}%` }} />)}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)} className="flex size-11 items-center justify-center rounded-full bg-fg text-canvas-script">
                {playing ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z" /></svg>}
              </button>
              <span className="num ml-1.5 text-[13px]">{fmt(t)}</span>
              <span className="num text-[13px] text-fg-muted">/ {fmt(tl.duration_s)}</span>
              <div className="flex-1" />
              <span className="text-xs text-fg-muted max-sm:hidden">Pause anywhere to leave a comment at that moment</span>
            </div>
          </div>
        </main>

        <aside aria-label="Comments" className="flex w-[420px] shrink-0 flex-col border-l border-rule-2 bg-panel-2 max-lg:w-auto max-lg:border-t max-lg:border-l-0">
          <div className="flex h-14 items-center gap-2 px-5"><h2 className="text-sm font-semibold">Comments</h2><span className="num text-xs text-fg-muted">{review.comments.length}</span></div>
          <ol className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
            {review.comments.length === 0 && <li className="px-3 py-2 text-[13px] text-fg-3">No comments yet.</li>}
            {review.comments.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 rounded-[10px] px-3 py-3.5">
                <div className="flex items-center gap-2.5">
                  <div aria-hidden className="flex size-[26px] items-center justify-center rounded-full bg-[#2a3a4a] text-[11px] font-semibold text-[#c9daea]">{c.authorName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</div>
                  <span className="text-[13px] font-medium">{c.authorName}</span>
                  <div className="flex-1" />
                  <button type="button" onClick={() => { setPlaying(false); setT(c.timecodeS); }} className="num flex h-[22px] items-center rounded-[5px] bg-[#2a2414] px-2 text-[11px] text-attention">{fmt(c.timecodeS)}</button>
                </div>
                <p className="text-sm leading-normal text-fg">{c.body}</p>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-2.5 border-t border-rule-2 px-5 pt-4 pb-5">
            <label className="flex flex-col gap-1 text-xs text-fg-3">Your name<input suppressHydrationWarning value={name} onChange={(e) => remember(e.target.value)} className="rounded-lg border border-line bg-canvas-script px-3 py-2 text-sm text-fg" /></label>
            <label htmlFor="new-comment" className="text-xs text-fg-3">Comment at <span className="num text-fg">{fmt(t)}</span></label>
            <textarea ref={box} id="new-comment" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What would you change here?" className="box-border w-full resize-none rounded-lg border border-line bg-canvas-script px-3 py-[11px] text-sm leading-normal text-fg" />
            {error && <p role="alert" className="text-[13px] text-attention">{error}</p>}
            <div className="flex justify-end"><button type="button" disabled={pending || !body.trim()} onClick={post} className="h-9 rounded-lg border border-line-strong bg-[#222227] px-4 text-[13px] font-medium disabled:opacity-50">Post comment</button></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
