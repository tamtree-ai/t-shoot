import { describe, expect, it } from "vitest";

import { estimateFilming } from "@/lib/estimate";
import { stickCatalog } from "@/lib/stick/registry";
import { STAGE_FLOWS, STICK_FLOWS, STUDIO_FLOWS } from "@/lib/tamtree/stage-flows";
import { kindOf, productionType, stageOf, typeOf } from "./registry";
import { PRODUCTION_KINDS } from "./types";

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

  it("registers every published stage flow exactly once, across all types", () => {
    const flows = PRODUCTION_KINDS.flatMap((k) => Object.values(productionType(k).flows));
    expect(new Set(flows).size).toBe(flows.length);
    expect(flows.sort()).toEqual([...STUDIO_FLOWS, ...STICK_FLOWS].sort());
    expect(STAGE_FLOWS).toContain("studio-publish");
    expect(flows).not.toContain("studio-publish");
  });

  it("puts stick_skit on the stick-* flows and pins StickStage's catalog version", () => {
    const stick = productionType("stick_skit");
    expect(stick.flows).toEqual({ script: "stick-script", produce: "stick-produce" });
    expect(stick.catalogVersion()).toBe(stickCatalog.version);
    expect(stick.catalogVersion()).toMatch(/^c1-[0-9a-f]{16}$/);
    expect(stick.steps).not.toContain("edit");
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
    expect(stageOf({ kind: "stick_skit" }, "stick-produce")).toBe("produce");
    expect(() => stageOf({ kind: "stick_skit" }, "studio-clip")).toThrow(/not a stage flow/);
  });
});
