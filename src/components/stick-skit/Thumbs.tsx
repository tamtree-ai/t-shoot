"use client";

import { evalActor } from "stickstage";
import { Stage } from "stickstage/remotion";

import { stickRegistry } from "@/lib/stick/registry";

const W = 1080;
const H = 1920;

/** A set as the engine draws it, empty, at frame 0. */
export function SetThumb({ id, className }: { id: string; className?: string }) {
  const set = stickRegistry.sets[id];
  if (!set) return null;
  return (
    <div aria-hidden className={`overflow-hidden [&>svg]:h-full [&>svg]:w-full ${className ?? ""}`}>
      <Stage set={set} actors={[]} width={W} height={H} frame={0} />
    </div>
  );
}

/** A character standing on the plain set, drawn by the engine. */
export function CharacterThumb({ id, expression = "happy", className }: { id: string; expression?: string; className?: string }) {
  const set = stickRegistry.sets["plain-1"]!;
  if (!stickRegistry.lib.characters[id]) return null;
  const state = evalActor(stickRegistry.lib, { character: id, poseKeys: [{ frame: 0, pose: "idle" }], expressionKeys: [{ frame: 0, expression }] }, 0, 30, set.figureHeightPx);
  return (
    <div aria-hidden className={`overflow-hidden [&>svg]:h-full [&>svg]:w-full ${className ?? ""}`}>
      <Stage set={set} actors={[{ id, state, x: 0.5, facing: "right" }]} width={W} height={H} frame={0} />
    </div>
  );
}
