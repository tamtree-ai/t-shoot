import { describe, expect, it } from "vitest";

import { estimateProduce, stickBriefOutsideDefaults, stickSkit, StickSkitDefaults } from ".";
import { stickCatalog } from "./catalog";

const brief = { topic: "Replying “sounds good” unread", cast: [{ id: "milo", character: "milo" }, { id: "june", character: "june" }] };
const all = StickSkitDefaults.parse({});

describe("stick_skit tenant defaults", () => {
  it("parses an org with no saved settings to the whole catalog, the plugin's voices and a $1.00 cap", () => {
    expect(all.allowed_sets).toEqual(stickCatalog.sets.map((s) => s.id));
    expect(all.allowed_characters).toEqual(["milo", "june"]);
    expect(all.voice_map).toEqual({ milo: "Puck", june: "Kore" });
    expect(all.limit_usd).toBe("1.00");
    expect(all.default_template).toBeUndefined();
  });

  it("drops ids a newer catalog no longer has, but refuses an empty list", () => {
    expect(StickSkitDefaults.parse({ allowed_sets: ["cafe-1", "moon-base-9"] }).allowed_sets).toEqual(["cafe-1"]);
    expect(() => StickSkitDefaults.parse({ allowed_sets: [] })).toThrow(/at least one set/);
    expect(() => StickSkitDefaults.parse({ allowed_characters: ["ghost"] })).toThrow(/at least one character/);
  });

  it("needs a voice for every allowed character, from the known voices", () => {
    expect(() => StickSkitDefaults.parse({ voice_map: { milo: "Puck" } })).toThrow(/every allowed character a voice/);
    expect(() => StickSkitDefaults.parse({ voice_map: { milo: "Puck", june: "Robot" } })).toThrow();
    expect(StickSkitDefaults.parse({ allowed_characters: ["milo"], voice_map: { milo: "Charon" } }).voice_map).toEqual({ milo: "Charon" });
  });
});

describe("a stick_skit brief against the defaults", () => {
  it("fits the whole catalog with a limit under the cap", () => {
    expect(stickBriefOutsideDefaults(brief, "1.00", all)).toBeNull();
  });

  it("refuses a character or set the workspace doesn't allow", () => {
    const miloOnly = StickSkitDefaults.parse({ allowed_characters: ["milo"], allowed_sets: ["cafe-1"] });
    expect(stickBriefOutsideDefaults(brief, "1.00", miloOnly)).toMatch(/june isn't available/);
    expect(stickBriefOutsideDefaults({ ...brief, cast: [brief.cast[0]!], set: "beach-1" }, "1.00", miloOnly)).toMatch(/set isn't available/);
  });

  it("holds a format to its cast size, and me-vs-me to two labels", () => {
    expect(stickBriefOutsideDefaults({ ...brief, template: "pov-monologue" }, "1.00", all)).toMatch(/one character/);
    expect(stickBriefOutsideDefaults({ ...brief, cast: [brief.cast[0]!], template: "interview" }, "1.00", all)).toMatch(/two characters/);
    const selves = [{ id: "me", character: "milo", label: "me" }, { id: "other", character: "milo" }];
    expect(stickBriefOutsideDefaults({ ...brief, template: "me-vs-me", cast: selves }, "1.00", all)).toMatch(/label/);
    selves[1]!.label = "my brain";
    expect(stickBriefOutsideDefaults({ ...brief, template: "me-vs-me", cast: selves }, "1.00", all)).toBeNull();
  });

  it("refuses a duplicate cast id, a zero limit and one past the cap", () => {
    expect(stickBriefOutsideDefaults({ ...brief, cast: [brief.cast[0]!, brief.cast[0]!] }, "1.00", all)).toMatch(/own name/);
    expect(stickBriefOutsideDefaults(brief, "0.00", all)).toMatch(/Set a limit/);
    expect(stickBriefOutsideDefaults(brief, "1.01", all)).toMatch(/caps a video at \$1\.00/);
  });
});

describe("stick_skit catalog and estimate", () => {
  it("serves its pinned catalog and refuses another version", async () => {
    await expect(stickSkit.catalog()).resolves.toBe(stickCatalog);
    await expect(stickSkit.catalog(stickCatalog.version)).resolves.toBe(stickCatalog);
    await expect(stickSkit.catalog("c1-0000000000000000")).rejects.toThrow(/written against catalog/);
  });

  it("prices making the video as TTS per line, render included", () => {
    expect(estimateProduce(13)).toEqual({ lineCount: 13, totalUsd: 0.0195, renderIncluded: true });
    const line = { id: "l1", speaker: "milo", character: "milo", text: "Sounds good." };
    expect(stickSkit.estimate({ skit: {}, lines: [line, { ...line, id: "l2" }] }).totalUsd).toBe(0.003);
  });
});
