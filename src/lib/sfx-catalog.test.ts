import { describe, expect, it } from "vitest";

import { SFX_CHOICES, stingForSlam } from "./sfx-catalog";

describe("sfx catalog", () => {
  it("lists StickStage's effects, including none's neighbour whoosh", () => {
    expect(SFX_CHOICES.map((s) => s.id)).toContain("whoosh");
    expect(SFX_CHOICES.map((s) => s.id)).toContain("record-scratch");
  });

  it("suggests a sting from the slam's words", () => {
    expect(stingForSlam("WAIT")).toBe("record-scratch");
    expect(stingForSlam("YES")).toBe("ding");
    expect(stingForSlam("HELLO")).toBe("whoosh");
  });
});
