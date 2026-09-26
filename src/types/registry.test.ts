import { describe, expect, it } from "vitest";

import { estimateFilming } from "@/lib/estimate";
import { STUDIO_FLOWS } from "@/lib/tamtree/stage-flows";
import { kindOf, productionType, stageOf, typeOf } from "./registry";

describe("production-type registry", () => {
  it("treats a project with no kind as ai_clips (before migration 0002)", () => {
    expect(kindOf({ title: "Octopus" })).toBe("ai_clips");
    expect(typeOf({}).label).toBe("AI clips");
  });

  it("refuses an unknown kind rather than guessing", () => {
    expect(() => kindOf({ kind: "hologram" })).toThrow(/Unknown production type/);
  });

  it("keeps ai_clips on the already-published studio-* flows", () => {
    const { flows } = productionType("ai_clips");
    expect(flows).toEqual({ script: "studio-script", narrate: "studio-narrate", clip: "studio-clip", render: "studio-render" });
    expect(Object.values(flows).sort()).toEqual([...STUDIO_FLOWS].sort());
  });

  it("prices an ai_clips draft exactly as the Script screen did before T1", () => {
    const beats = [1, 2, 3].map((i) => ({ narration: `Line ${i}.`, visual_prompt: `Shot ${i}` }));
    expect(productionType("ai_clips").estimate(beats)).toEqual(estimateFilming(beats.map(() => ({ reused: false }))));
  });

  it("parses a brief through the type's config schema", () => {
    const brief = { topic: "Octopus hearts", length_s: 45, tone: "curious", look: "moody-macro", voice: "kore" };
    expect(productionType("ai_clips").configSchema.parse(brief)).toEqual(brief);
    expect(() => productionType("ai_clips").configSchema.parse({ ...brief, length_s: 50 })).toThrow();
  });

  it("files a run under its type's stage key and refuses a foreign flow", () => {
    expect(stageOf({ kind: "ai_clips" }, "studio-clip")).toBe("clip");
    expect(stageOf({}, "studio-script")).toBe("script");
    expect(() => stageOf({ kind: "ai_clips" }, "stick-produce")).toThrow(/not a stage flow/);
  });
});
