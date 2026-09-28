"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { evalActor, PROP_BOUNDS, propUnit, type PropDef } from "stickstage";
import { PropView, Stage } from "stickstage/remotion";

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

/** A character standing on the plain set, drawn by the engine. `holding` shows that prop in the right hand. */
export function CharacterThumb({
  id,
  expression = "happy",
  holding,
  facing = "right",
  className,
}: {
  id: string;
  expression?: string;
  holding?: string;
  facing?: "left" | "right";
  className?: string;
}) {
  const aspect = characterAspect(id);
  const set = stickRegistry.sets[backdropId(aspect)];
  if (!set || !stickRegistry.lib.characters[id]) return null;
  const prop = holding && stickRegistry.lib.props[holding] ? holding : undefined;
  const { width, height } = paintSize(aspect);
  const frame = prop ? 8 : 0;
  const state = evalActor(
    stickRegistry.lib,
    {
      character: id,
      poseKeys: [{ frame: 0, pose: "idle" }],
      expressionKeys: [{ frame: 0, expression }],
      ...(prop ? { propKeys: [{ frame: 0, hand: "R" as const, prop }] } : {}),
    },
    frame,
    30,
    set.figureHeightPx,
  );
  return (
    <AfterMount className={`overflow-hidden ${className ?? ""}`}>
      <div aria-hidden className={`overflow-hidden [&>svg]:h-full [&>svg]:w-full ${className ?? ""}`}>
        <Stage set={set} actors={[{ id, state, x: 0.5, facing }]} width={width} height={height} frame={frame} />
      </div>
    </AfterMount>
  );
}

function propBox(def: PropDef): { x0: number; x1: number; y0: number; y1: number } {
  const extra = def as PropDef & { bounds?: { x0: number; x1: number; y0: number; y1: number } };
  if (extra.bounds) return extra.bounds;
  const known = (PROP_BOUNDS as Record<string, { x0: number; x1: number; y0: number; y1: number } | undefined>)[def.kind];
  return known ?? { x0: -0.08, x1: 0.08, y0: -0.16, y1: 0.05 };
}

/** One prop, centred on its bounds, on a 64px tile. */
export function PropThumb({ id, className }: { id: string; className?: string }) {
  const def = stickRegistry.lib.props[id];
  if (!def) return null;
  const figurePx = 640;
  const u = propUnit(def, figurePx);
  const box = propBox(def);
  const x = box.x0 * u;
  const y = box.y0 * u;
  const w = Math.max(1, (box.x1 - box.x0) * u);
  const h = Math.max(1, (box.y1 - box.y0) * u);
  const pad = Math.max(w, h) * 0.08;
  return (
    <AfterMount className={className}>
      <svg aria-hidden viewBox={`${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}`} className={`h-full w-full ${className ?? ""}`}>
        <PropView def={def} x={0} y={0} angle={0} figurePx={figurePx} stroke="#1a1a1a" sw={2.4} mirrored={false} fontFamily="sans-serif" />
      </svg>
    </AfterMount>
  );
}
