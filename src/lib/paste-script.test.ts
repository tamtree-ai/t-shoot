import { describe, expect, it } from "vitest";

import { clipsFromPaste, parsePastedScript } from "./paste-script";

describe("parsePastedScript", () => {
  it("reads name-and-colon lines and keeps emphasis", () => {
    const parsed = parsePastedScript(`Person A: "You get $10."\nPerson B: That's *not* the deal.`);
    expect(parsed.speakers).toEqual(["Person A", "Person B"]);
    expect(parsed.beats.map((b) => b.line)).toEqual(["You get $10.", "That's *not* the deal."]);
  });

  it("splits on time markers and drops stage directions", () => {
    const parsed = parsePastedScript(`[0–5 sec] — Hook\nNobody replied.\n[looks at the phone]\n[5–12 sec] - The turn\nJune: You sent it at 2am.`);
    expect(parsed.beats.map((b) => b.marker)).toEqual(["0–5 sec", "5–12 sec"]);
    expect(parsed.beats[0]!.line).toBe("Hook Nobody replied.");
    expect(parsed.beats[1]).toMatchObject({ speaker: "June", line: "You sent it at 2am." });
  });

  it("treats a blank line as a new beat when nobody is speaking", () => {
    const parsed = parsePastedScript("First thought.\n\nSecond thought.");
    expect(parsed.beats.map((b) => b.line)).toEqual(["First thought.", "Second thought."]);
    expect(parsed.speakers).toEqual([]);
  });
});

describe("clipsFromPaste", () => {
  it("makes one scene per paragraph", () => {
    const scenes = clipsFromPaste("An octopus has three hearts.\n\nIt would rather crawl.");
    expect(scenes).toHaveLength(2);
    expect(scenes[0]!.narration).toBe("An octopus has three hearts.");
    expect(scenes[1]!.visual_prompt).toContain("rather crawl");
  });
});
