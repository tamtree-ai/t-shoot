import { describe, expect, it } from "vitest";

import { stripEmphasis } from "./emphasis";
import { lineTitle } from "./line-title";
import { setLabel } from "@/types/stick-skit/catalog";

describe("library and script copy", () => {
  it("strips spoken emphasis marks", () => {
    expect(stripEmphasis("I *really* mean **this**")).toBe("I really mean this");
    expect(stripEmphasis("no marks")).toBe("no marks");
  });

  it("names sets the way a person would", () => {
    expect(setLabel("living-2")).toBe("Second living room");
    expect(setLabel("park-2")).toBe("Autumn park");
    expect(setLabel("street-night-1")).toBe("Night street");
    expect(setLabel("cafe-1")).toBe("Cafe");
    expect(setLabel("meeting-1")).toBe("Meeting room");
  });

  it("titles a scene from the first words of the line", () => {
    expect(lineTitle("one two three four five six seven eight", "Scene 1")).toBe("one two three four five six…");
    expect(lineTitle("short line", "Scene 1")).toBe("short line");
    expect(lineTitle("   ", "Scene 2")).toBe("Scene 2");
  });
});
