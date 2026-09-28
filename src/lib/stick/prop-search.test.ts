import { describe, expect, it } from "vitest";

import { closestProps, damerau, searchProps, suggestProps, type PropInfo } from "./prop-search";

const props: PropInfo[] = [
  { id: "fries", name: "Fries", category: "food", tags: ["snack"], aliases: ["chips", "hot chips", "french fries", "fry"], rank: 12 },
  { id: "taco", name: "Taco", category: "food", tags: ["snack"], aliases: [], rank: 18 },
  { id: "hot-dog", name: "Hot dog", category: "food", tags: ["snack"], aliases: ["hotdog"], rank: 20 },
  { id: "water-bottle", name: "Water bottle", category: "drinks", tags: ["water"], aliases: ["water"], rank: 5 },
  { id: "water-glass", name: "Water glass", category: "drinks", tags: ["water"], aliases: ["water"], rank: 6 },
  { id: "cup", name: "Cup", category: "drinks", tags: ["drink"], aliases: ["mug", "coffee", "tea"], rank: 8 },
  { id: "balloon", name: "Balloon", category: "party", tags: [], aliases: [], rank: 50 },
  { id: "gadget-a", name: "Gadget A", category: "tech", tags: [], aliases: ["gadget"], rank: 3 },
  { id: "gadget-b", name: "Gadget B", category: "tech", tags: [], aliases: ["gadget"], rank: 9 },
  { id: "sign", name: "Sign", category: "office", tags: [], aliases: ["placard"], rank: 40 },
];

const top = (query: string, category = "all") => searchProps(query, props, category)[0];

describe("searchProps", () => {
  it("scores each tier, and the first match wins", () => {
    expect(top("fries")).toMatchObject({ id: "fries", score: 100, via: null });
    expect(top("water-bottle")).toMatchObject({ id: "water-bottle", score: 100, via: null });
    expect(top("chips")).toMatchObject({ id: "fries", score: 90, via: "chips" });
    expect(top("frie")).toMatchObject({ id: "fries", score: 80, via: null });
    expect(top("cof")).toMatchObject({ id: "cup", score: 70, via: "coffee" });
    expect(top("snack")?.score).toBe(60);
    expect(top("bot")).toMatchObject({ id: "water-bottle", score: 40 });
    expect(damerau("watr", "water")).toBe(1);
    expect(searchProps("watr", props).map((h) => h.id)).toEqual(["water-bottle", "water-glass"]);
    expect(searchProps("watr", props).every((h) => h.score === 30)).toBe(true);
    expect(top("party")).toMatchObject({ id: "balloon", score: 20, via: null });
  });

  it("finds fries from chips, and both water props from a one-letter typo", () => {
    expect(searchProps("chips", props).map((h) => h.id)).toContain("fries");
    expect(searchProps("watr", props).map((h) => h.id)).toEqual(["water-bottle", "water-glass"]);
  });

  it("requires every word, and breaks equal scores on rank", () => {
    expect(searchProps("coffee mug", props).map((h) => h.id)).toEqual(["cup"]);
    expect(top("coffee mug")?.score).toBe(180);
    expect(searchProps("water bottle", props).map((h) => h.id)).toEqual(["water-bottle"]);
    expect(searchProps("gadget", props).map((h) => h.id)).toEqual(["gadget-a", "gadget-b"]);
  });

  it("searches every category, then lets a chip narrow the same query", () => {
    expect(searchProps("water", props).map((h) => h.id)).toEqual(["water-bottle", "water-glass"]);
    expect(searchProps("water", props, "food")).toEqual([]);
    expect(searchProps("", props, "drinks").map((h) => h.id)).toEqual(["water-bottle", "water-glass", "cup"]);
  });

  it("names the nearest props when nothing matches", () => {
    expect(searchProps("kebab", props)).toEqual([]);
    expect(closestProps("kebab", props).map((p) => p.name).length).toBe(2);
  });
});

describe("suggestProps", () => {
  it("reads fries, and both waters, from the line", () => {
    expect(suggestProps("These fries are my whole personality", props).map((h) => h.id)).toEqual(["fries"]);
    expect(suggestProps("Who drank my water", props).map((h) => h.id)).toEqual(["water-bottle", "water-glass"]);
  });

  it("does not typo-match a line", () => {
    expect(suggestProps("Who drank my watr", props)).toEqual([]);
  });
});
