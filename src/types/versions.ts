/**
 * What a version holds, by type (09 §3): a TimelineV1 the review player walks for `ai_clips`,
 * a rendered MP4 for `stick_skit`. The one place that tells the two payloads apart.
 */
import type { TimelineV1 } from "@/lib/timeline";
import type { StickVersionPayload } from "./stick-skit";

export type VersionMedia =
  | { kind: "timeline"; timeline: TimelineV1; durationS: number }
  | { kind: "video"; mp4AssetId: string; durationS: number };

export function versionMedia(version: { kind: string; payload: Record<string, unknown> }): VersionMedia {
  if (version.kind === "stick_skit") {
    const p = version.payload as unknown as StickVersionPayload;
    return { kind: "video", mp4AssetId: p.render.mp4, durationS: p.duration_s };
  }
  const timeline = version.payload as unknown as TimelineV1;
  return { kind: "timeline", timeline, durationS: timeline.duration_s };
}
