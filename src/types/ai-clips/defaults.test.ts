import { describe, expect, it } from "vitest";

import { AiClipsDefaults, briefOutsideDefaults } from ".";

const brief = { topic: "Octopus hearts", length_s: 45 as const, tone: "curious", look: "moody-macro", voice: "kore" };

describe("ai_clips tenant defaults", () => {
  it("parses an org with no saved settings to the pre-T3 brief behaviour", () => {
    expect(AiClipsDefaults.parse({})).toEqual({ default_voice: "zephyr", default_look: "nature-documentary", max_length_s: 60, limit_usd: "5.00" });
  });

  it("refuses a spend cap that isn't dollars and cents, or is zero", () => {
    expect(() => AiClipsDefaults.parse({ limit_usd: "lots" })).toThrow();
    expect(() => AiClipsDefaults.parse({ limit_usd: "0" })).toThrow();
    expect(() => AiClipsDefaults.parse({ default_voice: "hal" })).toThrow();
  });

  it("bounds a brief's length and limit by the org's defaults", () => {
    const d = AiClipsDefaults.parse({ max_length_s: 30, limit_usd: "3.00" });
    expect(briefOutsideDefaults(brief, "2.00", d)).toMatch(/up to 30s/);
    expect(briefOutsideDefaults({ ...brief, length_s: 30 }, "4.00", d)).toMatch(/caps a video at \$3.00/);
    expect(briefOutsideDefaults({ ...brief, length_s: 30 }, "0.00", d)).toMatch(/Set a limit/);
    expect(briefOutsideDefaults({ ...brief, length_s: 30 }, "3.00", d)).toBeNull();
  });
});
