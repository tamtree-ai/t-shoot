import { describe, expect, it } from "vitest";

import { ideasToDraft, weekStart } from "./draft-ahead";

describe("ideasToDraft", () => {
  const ideas = [{ id: "a", body: "a" }, { id: "b", body: "b" }, { id: "c", body: "c" }];

  it("writes only up to the weekly cap, in list order", () => {
    expect(ideasToDraft({ ideas, draftedThisWeek: 1, weeklyCap: 3 }).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("writes nothing once the cap is met", () => {
    expect(ideasToDraft({ ideas, draftedThisWeek: 3, weeklyCap: 3 })).toEqual([]);
  });
});

describe("weekStart", () => {
  it("lands on Monday", () => {
    expect(weekStart(new Date("2026-09-30T15:00:00Z")).toISOString().slice(0, 10)).toBe("2026-09-28");
  });
});
