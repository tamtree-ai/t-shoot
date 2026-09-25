import { describe, expect, it } from "vitest";

import { CLIP_PRICE_USD, NARRATE_PRICE_USD, estimateFilming } from "./estimate";

describe("estimateFilming", () => {
  it("charges every scene for film + voice when nothing is reused", () => {
    const scenes = Array.from({ length: 6 }, () => ({ reused: false }));
    const est = estimateFilming(scenes);
    expect(est.toFilmCount).toBe(6);
    expect(est.reusedCount).toBe(0);
    expect(est.filmCostUsd).toBeCloseTo(6 * CLIP_PRICE_USD);
    expect(est.voiceCostUsd).toBeCloseTo(6 * NARRATE_PRICE_USD);
    expect(est.totalUsd).toBeCloseTo(6 * CLIP_PRICE_USD + 6 * NARRATE_PRICE_USD);
  });

  it("skips film cost for reused scenes but still charges voice", () => {
    const scenes = [{ reused: true }, { reused: false }, { reused: false }];
    const est = estimateFilming(scenes);
    expect(est.toFilmCount).toBe(2);
    expect(est.reusedCount).toBe(1);
    expect(est.filmCostUsd).toBeCloseTo(2 * CLIP_PRICE_USD);
    expect(est.voiceCostUsd).toBeCloseTo(3 * NARRATE_PRICE_USD);
  });

  it("never reports zero minutes even for an empty script", () => {
    expect(estimateFilming([]).minutes).toBeGreaterThanOrEqual(1);
  });
});
