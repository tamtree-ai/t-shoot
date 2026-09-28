"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { evalActor } from "stickstage";
import { Stage } from "stickstage/remotion";

import { FRAME, type Aspect } from "@/lib/stick/frame";
import { stickCatalog, stickRegistry } from "@/lib/stick/registry";
import { characterAspect, setAspect } from "@/types/stick-skit/catalog";

/**
 * StickStage SVG ids differ between the server render and the client hydrate.
 * Paint the stage only after mount so the two trees never disagree.
 */
function AfterMount({ children, className }: { children: ReactNode; className?: string }) {
  const on = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!on) return <div className={className} />;
  return children;
}

function paintSize(aspect: Aspect): { width: number; height: number } {
  return FRAME[aspect];
}

function backdropId(aspect: Aspect): string {
  if (aspect === "9:16" && stickRegistry.sets["plain-1"]) return "plain-1";
  return stickCatalog.sets.find((s) => setAspect(s.id) === aspect)?.id ?? "plain-1";
}

/** A set as the engine draws it, empty, at frame 0. */
export function SetThumb({ id, className }: { id: string; className?: string }) {
  const set = stickRegistry.sets[id];
  if (!set) return null;
  const { width, height } = paintSize(setAspect(id));
  return (
    <AfterMount className={`overflow-hidden ${className ?? ""}`}>
      <div aria-hidden className={`overflow-hidden [&>svg]:h-full [&>svg]:w-full ${className ?? ""}`}>
        <Stage set={set} actors={[]} width={width} height={height} frame={0} />
      </div>
    </AfterMount>
  );
}

/** The picked cast standing on a set, drawn by the engine. One stage, so a picker can show the room. */
export function CastOnSet({ setId, characterIds, className }: { setId: string; characterIds: string[]; className?: string }) {
  const set = stickRegistry.sets[setId];
  if (!set) return null;
  const { width, height } = paintSize(setAspect(setId));
  const ids = characterIds.filter((id) => stickRegistry.lib.characters[id]);
  const spots = ids.length <= 1 ? [0.5] : [0.36, 0.64];
  const actors = ids.map((id, i) => {
    const facing: "left" | "right" = i === 0 ? "right" : "left";
    return {
      id: `${id}-${i}`,
      state: evalActor(
        stickRegistry.lib,
        { character: id, poseKeys: [{ frame: 0, pose: "idle" }], expressionKeys: [{ frame: 0, expression: "neutral" }] },
        0,
        30,
        set.figureHeightPx,
      ),
      x: spots[i] ?? 0.5,
      facing,
    };
  });
  return (
    <AfterMount className={`overflow-hidden ${className ?? ""}`}>
      <div aria-hidden className={`overflow-hidden [&>svg]:h-full [&>svg]:w-full ${className ?? ""}`}>
        <Stage set={set} actors={actors} width={width} height={height} frame={0} />
      </div>
    </AfterMount>
  );
}

/** A character standing on the plain set, drawn by the engine. */
export function CharacterThumb({ id, expression = "happy", className }: { id: string; expression?: string; className?: string }) {
  const aspect = characterAspect(id);
  const set = stickRegistry.sets[backdropId(aspect)];
  if (!set || !stickRegistry.lib.characters[id]) return null;
  const { width, height } = paintSize(aspect);
  const state = evalActor(stickRegistry.lib, { character: id, poseKeys: [{ frame: 0, pose: "idle" }], expressionKeys: [{ frame: 0, expression }] }, 0, 30, set.figureHeightPx);
  return (
    <AfterMount className={`overflow-hidden ${className ?? ""}`}>
      <div aria-hidden className={`overflow-hidden [&>svg]:h-full [&>svg]:w-full ${className ?? ""}`}>
        <Stage set={set} actors={[{ id, state, x: 0.5, facing: "right" }]} width={width} height={height} frame={0} />
      </div>
    </AfterMount>
  );
}
