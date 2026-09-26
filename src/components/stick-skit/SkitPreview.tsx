"use client";

import { Player } from "@remotion/player";
import { useMemo } from "react";
import { checkDraft, SkitError, type Diagnostic } from "stickstage";
import { StickStageComposition } from "stickstage/remotion";

import { stickRegistry } from "@/lib/stick/registry";

type Compiled = { ok: true; program: ReturnType<typeof checkDraft>["result"]["program"] } | { ok: false; diagnostics: Diagnostic[] };

/**
 * A silent preview of a skit on placeholder timings (09 §6 step 4): compiled in the browser with
 * the same `checkDraft` the render service runs, so what plays here is what gets voiced. Mouths
 * and word timings are estimated until the real voices exist.
 */
export function SkitPreview({ skit, className }: { skit: unknown; className?: string }) {
  const compiled = useMemo<Compiled>(() => {
    try {
      return { ok: true, program: checkDraft(skit, stickRegistry).result.program };
    } catch (e) {
      if (e instanceof SkitError) return { ok: false, diagnostics: e.diagnostics };
      throw e;
    }
  }, [skit]);

  if (!compiled.ok) {
    return (
      <div role="alert" className={`flex aspect-[9/16] items-center justify-center rounded-xl border border-rule bg-panel p-6 text-center text-[13px] text-fg-3 ${className ?? ""}`}>
        The preview can&rsquo;t play until {compiled.diagnostics.length === 1 ? "this problem is" : `these ${compiled.diagnostics.length} problems are`} fixed.
      </div>
    );
  }
  const { program } = compiled;
  return (
    <Player
      component={StickStageComposition}
      inputProps={{ program, sets: stickRegistry.sets, lib: stickRegistry.lib, safeArea: stickRegistry.safeArea, fontFamily: "var(--font-sans), sans-serif", audio: false }}
      durationInFrames={program.durationInFrames}
      fps={program.fps}
      compositionWidth={program.width}
      compositionHeight={program.height}
      controls
      loop
      className={`aspect-[9/16] w-full overflow-hidden rounded-xl ${className ?? ""}`}
      style={{ width: "100%" }}
    />
  );
}
