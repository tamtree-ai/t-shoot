import { describe, expect, it } from "vitest";

import { draftKeepsPlan, reviseKeepsPlan, scenePlanOf } from "./writer-eval";

const one = { set: "cafe-1", beats: [{ id: "l1" }] };
const two = {
  scenes: [
    { id: "s1", set: "cafe-1", beats: [{ id: "l1" }] },
    { id: "s2", set: "park-1", beats: [{ id: "l2" }] },
  ],
};

describe("scene plan scoring", () => {
  it("reads one scene from a set, or one per scenes[] entry", () => {
    expect(scenePlanOf(one)).toEqual({ scenes: 1, sets: ["cafe-1"] });
    expect(scenePlanOf(two)).toEqual({ scenes: 2, sets: ["cafe-1", "park-1"] });
  });

  it("keeps a draft's plan when the count matches and named sets land in order", () => {
    expect(draftKeepsPlan({}, one)).toBe(true);
    expect(draftKeepsPlan({ set: "cafe-1" }, one)).toBe(true);
    expect(draftKeepsPlan({ set: "office-1" }, one)).toBe(false);
    expect(draftKeepsPlan({ scenes: 2, sets: ["cafe-1"] }, two)).toBe(true);
    expect(draftKeepsPlan({ scenes: 2, sets: ["cafe-1", "park-1"] }, two)).toBe(true);
    expect(draftKeepsPlan({ scenes: 2 }, one)).toBe(false);
    expect(draftKeepsPlan({ scenes: 3 }, two)).toBe(false);
  });

  it("keeps a change's plan when the scene count and sets are untouched", () => {
    expect(reviseKeepsPlan(two, two)).toBe(true);
    expect(reviseKeepsPlan(two, { ...two, scenes: [two.scenes[0]] })).toBe(false);
    expect(reviseKeepsPlan(one, { ...one, set: "park-1" })).toBe(false);
  });
});
