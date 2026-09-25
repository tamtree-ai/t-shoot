import { describe, expect, it } from "vitest";

import { buildTimeline, locate, sceneLength, timelineDigest } from "./timeline";

const scene = (id: string, len: number) => ({ scene_id: id, position: 1, title: id, length_s: len, clip_asset_id: null, narration_asset_id: null, trim_start_s: 0, trim_end_s: null, captions: [] });

describe("sceneLength", () => {
  const base = { narration: "Two hearts push blood.", narrationDurationS: 4, trimStartS: 0, trimEndS: null };
  it("uses the clip length when it is longer than the voice", () => expect(sceneLength(base, 6)).toBe(6));
  it("never goes below the narration, however hard the trim", () => expect(sceneLength({ ...base, trimEndS: 1 }, 6)).toBe(4));
  it("applies a trim above the floor", () => expect(sceneLength({ ...base, trimStartS: 1, trimEndS: 6 }, 8)).toBe(5));
});

describe("timeline", () => {
  const tl = buildTimeline([scene("a", 6), scene("b", 4.5)]);
  it("sums duration and is frozen at 1080×1920 @ 30fps", () => {
    expect(tl).toMatchObject({ duration_s: 10.5, width: 1080, height: 1920, fps: 30 });
  });
  it("has a stable digest regardless of key order, and a different one when a scene changes", () => {
    expect(timelineDigest({ a: 1, b: [1, 2] })).toBe(timelineDigest({ b: [1, 2], a: 1 }));
    expect(timelineDigest(tl)).not.toBe(timelineDigest(buildTimeline([scene("a", 6), scene("b", 5)])));
  });
  it("locates a moment on the film", () => {
    expect(locate(tl, 2)).toEqual({ sceneId: "a", localT: 2 });
    expect(locate(tl, 7)).toEqual({ sceneId: "b", localT: 1 });
    expect(locate(tl, 99)?.sceneId).toBe("b");
  });
});
