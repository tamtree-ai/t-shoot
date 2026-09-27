import { describe, expect, it } from "vitest";

import { blankPost, postProblem } from "./post";

describe("a platform post", () => {
  it("starts private, labelled as AI, and ready to confirm", () => {
    const draft = blankPost({ title: "Savings", description: "A jacket on sale.", hashtags: "#stickfigure" });
    expect(draft.privacy).toBe("private");
    expect(draft.aiGenerated).toBe(true);
    expect(postProblem("youtube", draft)).toBeNull();
    expect(postProblem("instagram", { ...draft, title: "" })).toBeNull();
  });

  it("refuses a YouTube post with no title and a caption that is too long for Instagram", () => {
    const draft = blankPost({ description: "Hello" });
    expect(postProblem("youtube", draft)).toMatch(/title/);
    expect(postProblem("instagram", { ...draft, description: "x".repeat(2201) })).toMatch(/2200/);
  });

  it("refuses a schedule time that already passed", () => {
    const draft = blankPost({ title: "T", description: "D", hashtags: "" });
    expect(postProblem("tiktok", { ...draft, scheduledAt: "2020-01-01T00:00:00.000Z" })).toMatch(/future/);
  });
});
