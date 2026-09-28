import { describe, expect, it } from "vitest";

import { assertPublicUrl, topicsFromArticle } from "./topics";

describe("topicsFromArticle", () => {
  it("returns three to five topics with a line each", () => {
    const text = [
      "Loss aversion is why a lost ten dollars stings more than a found ten dollars pleases.",
      "People check a price twice when the number is framed as a loss.",
      "A receipt that says you saved money changes the next purchase.",
      "The same effect shows up in how teams talk about deadlines.",
      "Naming the loss out loud makes the choice feel heavier than the gain.",
    ].join(" ");
    const topics = topicsFromArticle(text, "Why losses feel bigger");
    expect(topics.length).toBeGreaterThanOrEqual(3);
    expect(topics.length).toBeLessThanOrEqual(5);
    expect(topics[0]!.title.length).toBeGreaterThan(0);
    expect(topics[0]!.line.length).toBeGreaterThan(0);
  });
});

describe("assertPublicUrl", () => {
  it("accepts a public https link and refuses loopback", () => {
    expect(assertPublicUrl("https://example.com/story").hostname).toBe("example.com");
    expect(() => assertPublicUrl("http://127.0.0.1/admin")).toThrow(/private/);
    expect(() => assertPublicUrl("file:///etc/passwd")).toThrow(/http/);
  });
});
