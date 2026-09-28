import { describe, expect, it } from "vitest";

import { canApprove, judgeSkit } from "@/types/stick-skit/draft";

import { parsePastedScript } from "./paste-script";
import { skitFromPaste } from "./skit-from-paste";

describe("skitFromPaste", () => {
  it("opens on a skit the gate can approve, with speakers mapped onto the cast", () => {
    const parsed = parsePastedScript('Person A: "You get $10."\nPerson B: That is not the deal.');
    const skit = skitFromPaste({
      title: "The deal",
      beats: parsed.beats,
      mapping: { "Person A": "milo", "Person B": "june" },
      setId: "plain-1",
      fallbackCharacter: "milo",
    });
    const verdict = judgeSkit(skit);
    expect(verdict.check.errors).toBe(0);
    expect(canApprove(verdict)).toBe(true);
    expect(verdict.lines.map((l) => l.character)).toEqual(["milo", "june"]);
  });
});