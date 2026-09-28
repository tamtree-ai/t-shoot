"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { evalActor } from "stickstage";
import { Stage } from "stickstage/remotion";

import { stickRegistry } from "@/lib/stick/registry";

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

const W = 1080;
const H = 1920;

/** A set as the engine draws it, empty, at frame 0. */
export function SetThumb({ id, className }: { id: string; className?: string }) {
  const set = stickRegistry.sets[id];
  if (!set) return null;
  return (
    <AfterMount className={`overflow-hidden ${className ?? ""}`}>
      <div aria-hidden className={`overflow-hidden [&>svg]:h-full [&>svg]:w-full ${className ?? ""}`}>
        <Stage set={set} actors={[]} width={W} height={H} frame={0} />
      </div>
    </AfterMount>
  );
}

/** The picked cast standing on a set, drawn by the engine. One stage, so a picker can show the room. */
export function CastOnSet({ setId, characterIds, className }: { setId: string; characterIds: string[]; className?: string }) {
  const set = stickRegistry.sets[setId];
  if (!set) return null;
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
        <Stage set={set} actors={actors} width={W} height={H} frame={0} />
      </div>
    </AfterMount>
  );
}

/** A character standing on the plain set, drawn by the engine. */
export function CharacterThumb({ id, expression = "happy", className }: { id: string; expression?: string; className?: string }) {
  const set = stickRegistry.sets["plain-1"]!;
  if (!stickRegistry.lib.characters[id]) return null;
  const state = evalActor(stickRegistry.lib, { character: id, poseKeys: [{ frame: 0, pose: "idle" }], expressionKeys: [{ frame: 0, expression }] }, 0, 30, set.figureHeightPx);
  return (
    <AfterMount className={`overflow-hidden ${className ?? ""}`}>
      <div aria-hidden className={`overflow-hidden [&>svg]:h-full [&>svg]:w-full ${className ?? ""}`}>
        <Stage set={set} actors={[{ id, state, x: 0.5, facing: "right" }]} width={W} height={H} frame={0} />
      </div>
    </AfterMount>
  );
}
