"use client";

import { clock, gradientFor, StateMark } from "./shared";
import type { SceneVM } from "@/services/edit-model";

/**
 * The preview behind a small interface (07 §4 "Preview player"): today a gradient
 * placeholder plus a caption overlay driven by the scene's phrases; when the composition
 * package lands it swaps to @remotion/player without changing the props.
 */
export function PhonePreview({ scene, localT, playing, onToggle, onPrev, onNext, progress }: {
  scene: SceneVM;
  localT: number;
  playing: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  progress: number;
}) {
  const caption = captionAt(scene, localT);
  const filmed = scene.takes.some((t) => t.ready);
  return (
    <div role="img" aria-label={`Phone preview of scene ${scene.position}`} className="relative box-border h-[530px] w-[288px] rounded-[40px] bg-[#050506] p-[9px] shadow-[0_0_0_1px_#3a3a42,inset_0_0_0_1px_rgba(255,255,255,0.05),0_24px_70px_rgba(0,0,0,0.6)]">
      <div className="absolute top-[18px] left-[107px] z-[2] h-[22px] w-[74px] rounded-[11px] bg-black" />
      <div className="relative h-[512px] w-[270px] overflow-hidden rounded-[32px]" style={{ background: gradientFor(scene.position) }}>
        <div className="absolute inset-0 flex items-center justify-center p-10 text-center text-[11px] leading-normal text-white/40">
          {filmed ? `[footage — scene ${scene.position}, take ${scene.takes.find((t) => t.id === scene.chosenTakeId)?.number ?? 1}]` : "Not filmed yet"}
        </div>
        {caption && (
          <div className="absolute right-[18px] bottom-[112px] left-[18px] text-center text-[23px] leading-[1.18] font-bold tracking-[-0.015em] text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.6)]">
            {caption}
          </div>
        )}
        <div className="absolute bottom-[22px] left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-[22px] bg-black/55 px-2 py-[5px]">
          <button type="button" aria-label="Previous scene" onClick={onPrev} className="flex size-[30px] items-center justify-center rounded-full text-white">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M18 4L8 12l10 8z" /><rect x="4" y="4" width="3" height="16" rx="1" /></svg>
          </button>
          <button type="button" aria-label={playing ? "Pause (Space)" : "Play (Space)"} onClick={onToggle} className="flex size-[38px] items-center justify-center rounded-full bg-white text-black">
            {playing ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z" /></svg>
            )}
          </button>
          <button type="button" aria-label="Next scene" onClick={onNext} className="flex size-[30px] items-center justify-center rounded-full text-white">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l10 8-10 8z" /><rect x="17" y="4" width="3" height="16" rx="1" /></svg>
          </button>
        </div>
        <div className="absolute right-0 bottom-0 left-0 h-[3px] bg-white/10"><div className="h-[3px] bg-accent" style={{ width: `${Math.min(100, progress * 100)}%` }} /></div>
      </div>
    </div>
  );
}

/** The caption for a moment in a scene: phrases (with the user's word fixes), else the line. */
export function captionAt(scene: SceneVM, t: number): string {
  if (scene.phrases.length === 0) return scene.narration;
  const i = scene.phrases.findIndex((p) => t >= p.start_s && t < p.end_s);
  const idx = i === -1 ? (t < 0 ? 0 : scene.phrases.length - 1) : i;
  return scene.captionOverrides[idx] ?? scene.phrases[idx].text;
}

export function StageHeader({ scene, total, needsYou, onNeedsYou }: { scene: SceneVM; total: number; needsYou: number; onNeedsYou: () => void }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-rule px-5">
      <span className="text-[11px] tracking-[0.08em] text-fg-muted uppercase">Scene {scene.position} of {total}</span>
      <span className="text-[15px] font-semibold">{scene.title}</span>
      <span className="num text-xs text-fg-3">{scene.lengthS.toFixed(1)}s</span>
      <StateMark state={scene.state} />
      <div className="flex-1" />
      {needsYou > 0 && (
        <button type="button" onClick={onNeedsYou} className="flex h-7 items-center gap-1.5 rounded-[7px] border border-attention-line bg-attention-soft px-2.5 text-xs text-attention">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17.5v.01" /></svg>
          {needsYou} scene{needsYou === 1 ? "" : "s"} need{needsYou === 1 ? "s" : ""} you
        </button>
      )}
    </div>
  );
}

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[3px]"><span className="font-mono text-[10px] tracking-[0.08em] text-fg-muted">{k}</span><span className="text-[13px] leading-[1.45] text-fg-2">{children}</span></div>
  );
}

export function StageFacts({ scene, voiceName, globalT, total }: { scene: SceneVM; voiceName: string; globalT: number; total: number }) {
  const take = scene.takes.find((t) => t.id === scene.chosenTakeId);
  return (
    <>
      <div className="flex w-[170px] flex-col gap-3.5 justify-self-end max-[1279px]:hidden">
        <Fact k="CLIP">{take ? <>Take {take.number}</> : "None yet"}</Fact>
        <Fact k="VOICE">{voiceName}{scene.narrationDurationS ? <> · <span className="num">{scene.narrationDurationS.toFixed(1)}s</span></> : null}</Fact>
        <Fact k="FORMAT">9:16 · 1080×1920 · 30 fps</Fact>
      </div>
      <div className="flex w-[170px] flex-col gap-3.5 justify-self-start max-[1279px]:hidden">
        <Fact k="PREVIEW">Free, and matches the export frame for frame</Fact>
        <Fact k="TIME"><span className="num">{clock(globalT)} <span className="text-fg-muted">/ {clock(total)}</span></span></Fact>
        <div className="flex items-center gap-1 text-[11px] text-fg-muted">
          <kbd className="flex h-5 items-center rounded border border-line bg-raised px-1.5 font-mono text-[10px] text-fg-2">Space</kbd>
          <kbd className="flex size-5 items-center justify-center rounded border border-line bg-raised font-mono text-[10px] text-fg-2">←</kbd>
          <kbd className="flex size-5 items-center justify-center rounded border border-line bg-raised font-mono text-[10px] text-fg-2">→</kbd>
          <span className="ml-1">play · scenes</span>
        </div>
      </div>
    </>
  );
}

export function FailureBanner({ scene, onRetry, onAsk, onRaise }: { scene: SceneVM; onRetry: () => void; onAsk: () => void; onRaise: () => void }) {
  const f = scene.clip.failure ?? scene.voice.failure;
  if (!f) return null;
  return (
    <div role="alert" className="mx-5 mt-3 flex items-center gap-3 rounded-lg border border-attention-line bg-attention-soft px-3.5 py-2.5 text-[13px] text-fg-2">
      <span className="flex-1">{f.message}</span>
      {f.action === "try-again" && <button type="button" onClick={onRetry} className="h-8 rounded-lg border border-line-strong bg-[#222227] px-3 font-medium text-fg">Try again</button>}
      {f.action === "ask-for-change" && <button type="button" onClick={onAsk} className="h-8 rounded-lg border border-line-strong bg-[#222227] px-3 font-medium text-fg">Ask for a change</button>}
      {f.action === "raise-limit" && <button type="button" onClick={onRaise} className="h-8 rounded-lg border border-line-strong bg-[#222227] px-3 font-medium text-fg">Raise limit</button>}
    </div>
  );
}
