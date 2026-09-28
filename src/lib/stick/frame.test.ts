import { describe, expect, it } from "vitest";

import { aspectOfBrief, aspectOfSize, aspectOfSkit, engineTakesBriefAspect, engineTakesBriefProps, explicitFrame, fitFrame, FRAME, skitForEngine } from "./frame";
import { prepareWriterBrief } from "./writer-brief";

const cast = [{ id: "milo", character: "milo" }];

describe("frame", () => {
  it("treats a missing aspect as a short, and reads a stated one", () => {
    expect(aspectOfBrief({})).toBe("9:16");
    expect(aspectOfBrief({ aspect: "16:9" })).toBe("16:9");
    expect(aspectOfBrief({ aspect: "square" })).toBe("9:16");
  });

  it("reads a skit's frame from aspect or from pixels, and leaves an unstated skit to the fallback", () => {
    expect(explicitFrame({ meta: { title: "T" } })).toBeUndefined();
    expect(aspectOfSkit({ meta: { title: "T" } }, "9:16")).toBe("9:16");
    expect(aspectOfSkit({ meta: { aspect: "16:9" } })).toBe("16:9");
    expect(aspectOfSize(1920, 1080)).toBe("16:9");
    expect(aspectOfSize(960, 540)).toBe("16:9");
    expect(aspectOfSize(1080, 1920)).toBe("9:16");
    expect(aspectOfSkit({ meta: { width: 1920, height: 1080 } })).toBe("16:9");
  });

  it("fits a wide box to the frame", () => {
    const wide = fitFrame(800, 800, "16:9");
    const tall = fitFrame(800, 800, "9:16");
    expect(wide.width).toBeGreaterThan(wide.height);
    expect(tall.height).toBeGreaterThan(tall.width);
    expect(wide).toEqual({ width: 800, height: Math.floor(800 / (FRAME["16:9"].width / FRAME["16:9"].height)) });
  });

  it("copies aspect into pixels for the current checker and drops the key", () => {
    const skit = { meta: { title: "Wide", aspect: "16:9" }, set: "wide-living" };
    const ready = skitForEngine(skit);
    expect(ready.meta).toEqual({ title: "Wide", width: 1920, height: 1080 });
    expect(skit.meta).toEqual({ title: "Wide", aspect: "16:9" });
    expect(skitForEngine({ meta: { title: "T", aspect: "16:9", width: 1920, height: 1080 } }).meta).toEqual({
      title: "T",
      width: 1920,
      height: 1080,
    });
  });

  it("omits aspect for a writer that rejects the field, and refuses widescreen there", () => {
    const short = prepareWriterBrief({ topic: "x", cast, aspect: "9:16" }, ["cafe-1", "plain-1"]);
    if (engineTakesBriefAspect()) {
      expect(short.aspect).toBe("9:16");
      expect(short.allowed_sets?.every((id) => id === "cafe-1" || id === "plain-1")).toBe(true);
    } else {
      expect(short).not.toHaveProperty("aspect");
      expect(short.allowed_sets).toEqual(["cafe-1", "plain-1"]);
      expect(() => prepareWriterBrief({ topic: "x", cast, aspect: "16:9" }, ["cafe-1"])).toThrow(/only writes shorts/);
    }
  });

  it("omits props until the writer schema accepts them", () => {
    const brief = prepareWriterBrief({ topic: "x", cast, props: ["cup"] }, ["cafe-1"]);
    if (engineTakesBriefProps()) expect(brief.props).toEqual(["cup"]);
    else expect(brief).not.toHaveProperty("props");
  });
});
