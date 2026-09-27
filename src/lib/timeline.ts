/**
 * The TimelineV1 draft (video-generation 02-timeline-v1.md, frozen 1080×1920 @ 30 fps),
 * built from t-shoot's document. A version is a snapshot of this plus its digest, so
 * an identical film never renders twice and an old version can be downloaded as it was.
 * Typed loosely until the zod TimelineV1 lands with the Remotion package (W5).
 */
import { createHash } from "node:crypto";

import { estimateNarrationSeconds } from "./narration";

const round1 = (n: number) => Math.round(n * 10) / 10;

export function sceneLength(s: { narration: string; narrationDurationS: number | null; trimStartS: number; trimEndS: number | null }, clipDurationS: number | null): number {
  const narrationS = s.narrationDurationS ?? estimateNarrationSeconds(s.narration);
  const end = s.trimEndS ?? clipDurationS ?? narrationS;
  return round1(Math.max(narrationS, end - s.trimStartS));
}

export type TimelineScene = {
  scene_id: string;
  position: number;
  title: string;
  length_s: number;
  clip_asset_id: string | null;
  narration_asset_id: string | null;
  trim_start_s: number;
  trim_end_s: number | null;
  captions: { text: string; start_s: number; end_s: number }[];
};

export type TimelineV1 = {
  version: 1;
  width: 1080;
  height: 1920;
  fps: 30;
  duration_s: number;
  scenes: TimelineScene[];
};

export function buildTimeline(scenes: TimelineScene[]): TimelineV1 {
  return { version: 1, width: 1080, height: 1920, fps: 30, duration_s: round1(scenes.reduce((n, s) => n + s.length_s, 0)), scenes };
}

export function timelineDigest(timeline: unknown): string {
  return createHash("sha256").update(canonical(timeline)).digest("hex").slice(0, 16);
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/** Scene index and local time for a moment on the film — used to route a comment to its scene. */
export function locate(timeline: { scenes: { length_s: number; scene_id: string }[] }, t: number): { sceneId: string; localT: number } | null {
  let start = 0;
  for (const s of timeline.scenes) {
    if (t < start + s.length_s) return { sceneId: s.scene_id, localT: t - start };
    start += s.length_s;
  }
  const last = timeline.scenes.at(-1);
  return last ? { sceneId: last.scene_id, localT: last.length_s } : null;
}
