"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useMemo, useRef, useState } from "react";
import { checkDraft, SkitError, type Diagnostic } from "stickstage";
import { StickStageComposition } from "stickstage/remotion";

import { stickRegistry } from "@/lib/stick/registry";

export type BeatSpan = { id: string; from: number; to: number };

type PreviewProgram = ReturnType<typeof checkDraft>["result"]["program"];
type BeatLike = { id: string; from: number; to: number };
type SceneLike = { from: number; timeline: { beats: BeatLike[] } };

type Compiled = { ok: true; program: PreviewProgram; spans: BeatSpan[] } | { ok: false; diagnostics: Diagnostic[] };

function compile(skit: unknown): Compiled {
  try {
    const program = checkDraft(skit, stickRegistry).result.program;
    const scenes = (program as unknown as { scenes: SceneLike[] }).scenes;
    const spans = scenes.flatMap((sc) => sc.timeline.beats.map((b) => ({ id: b.id, from: sc.from + b.from, to: sc.from + b.to })));
    return { ok: true, program, spans };
  } catch (e) {
    if (e instanceof SkitError) return { ok: false, diagnostics: e.diagnostics };
    throw e;
  }
}

/**
 * Silent preview. Width and height are pixels, so Remotion can size its canvas
 * immediately instead of staying at opacity 0.
 */
export function SkitPreview({
  skit,
  width,
  height,
  seekTo,
  onFrame,
  onSpans,
}: {
  skit: unknown;
  width: number;
  height: number;
  seekTo?: { frame: number; nonce: number } | null;
  onFrame?: (frame: number) => void;
  onSpans?: (spans: BeatSpan[], duration: number) => void;
}) {
  const compiled = useMemo(() => compile(skit), [skit]);
  const ref = useRef<PlayerRef>(null);
  const root = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [paint, setPaint] = useState<{ attempt: number; ok: boolean } | null>(null);

  useEffect(() => {
    if (!compiled.ok) return;
    onSpans?.(compiled.spans, compiled.program.durationInFrames);
  }, [compiled, onSpans]);

  useEffect(() => {
    if (!seekTo || !ref.current) return;
    ref.current.seekTo(Math.max(0, Math.min(seekTo.frame, (compiled.ok ? compiled.program.durationInFrames : 1) - 1)));
  }, [seekTo, compiled]);

  useEffect(() => {
    const player = ref.current;
    if (!player || !onFrame) return;
    const fn = (e: { detail: { frame: number } }) => onFrame(e.detail.frame);
    player.addEventListener("frameupdate", fn);
    return () => player.removeEventListener("frameupdate", fn);
  }, [onFrame, compiled, attempt]);

  useEffect(() => {
    if (!compiled.ok || width < 8) return;
    const timer = setTimeout(() => {
      const canvas = root.current?.querySelector("canvas");
      if (!canvas || canvas.clientWidth < 2) {
        setPaint({ attempt, ok: false });
        return;
      }
      let el: HTMLElement | null = canvas;
      let hidden = false;
      while (el && el !== root.current) {
        if (getComputedStyle(el).opacity === "0") hidden = true;
        el = el.parentElement;
      }
      setPaint({ attempt, ok: !hidden });
    }, 900);
    return () => clearTimeout(timer);
  }, [compiled, width, height, attempt]);

  if (!compiled.ok) {
    const n = compiled.diagnostics.length;
    return (
      <div role="alert" style={{ width, height }} className="flex items-center justify-center rounded-xl border border-rule bg-panel p-4 text-center text-[13px] leading-snug text-fg-3">
        The preview can’t play until {n === 1 ? "this problem is" : `these ${n} problems are`} fixed.
      </div>
    );
  }

  const { program } = compiled;
  return (
    <div ref={root} className="relative" style={{ width, height }}>
      <Player
        key={attempt}
        ref={ref}
        component={StickStageComposition}
        inputProps={{ program, sets: stickRegistry.sets, lib: stickRegistry.lib, safeArea: stickRegistry.safeArea, fontFamily: "var(--font-sans), sans-serif", audio: false }}
        durationInFrames={program.durationInFrames}
        fps={program.fps}
        compositionWidth={program.width}
        compositionHeight={program.height}
        controls
        loop
        spaceKeyToPlayOrPause={false}
        style={{ width, height }}
        className="overflow-hidden rounded-xl"
      />
      {paint?.attempt === attempt && !paint.ok && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-panel/95 px-4 text-center">
          <p className="text-[13px] text-fg-2">The preview didn’t paint.</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="h-8 rounded-lg bg-hover px-3 text-[13px] font-medium">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
