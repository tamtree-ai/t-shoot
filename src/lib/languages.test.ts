import { describe, expect, it } from "vitest";

import { languageBadges } from "./languages";

describe("languageBadges", () => {
  it("shows the original and its translations as one set of badges", () => {
    const projects = [
      { id: "a", language: "en", sourceProjectId: null },
      { id: "b", language: "es", sourceProjectId: "a" },
      { id: "c", language: "hi", sourceProjectId: "a" },
      { id: "d", language: "en", sourceProjectId: null },
    ];
    expect(languageBadges(projects, "a")).toEqual(["EN", "ES", "HI"]);
    expect(languageBadges(projects, "b")).toEqual(["EN", "ES", "HI"]);
    expect(languageBadges(projects, "d")).toEqual(["EN"]);
  });
});
