import { describe, expect, it } from "vitest";

import groupChat from "@/lib/tamtree/mock/stick/group-chat.skit.json";
import type { Skit } from "@/lib/tamtree/stage-flows";
import { addBeat, alignSlams, allBeats, beatsOf, canApprove, deleteBeat, duplicateBeat, editBeat, findingTarget, judgeSkit, moveBeat, scenesOf, setSceneSet, withBeats, scenePlanOf } from "./draft";

const skit = groupChat as Skit;

describe("judgeSkit", () => {
  it("passes the committed skit, with a line per spoken beat", () => {
    const v = judgeSkit(skit);
    expect(v.check.errors).toBe(0);
    expect(v.lines.length).toBe(beatsOf(skit).filter((b) => !b.silent).length);
    expect(v.estimatedDurationS).toBeGreaterThan(0);
    expect(canApprove(v)).toBe(true);
  });

  it("re-checks an edit without a run, and a broken one shuts the gate", () => {
    const edited = editBeat(skit, "l2", { line: "We saw it. All of us." });
    expect(judgeSkit(edited).lines.find((l) => l.id === "l2")?.text).toBe("We saw it. All of us.");

    const broken = editBeat(skit, "l2", { speaker: "nobody" });
    const v = judgeSkit(broken);
    expect(v.check.errors).toBeGreaterThan(0);
    expect(v.check.findings.length).toBeGreaterThan(0);
    expect(canApprove(v)).toBe(false);
  });

  it("refuses a line of only spaces, which the engine alone would voice", () => {
    const v = judgeSkit(editBeat(skit, "l2", { line: "   " }));
    expect(v.check.findings[0]).toMatchObject({ check: "blank-line", path: "beats[1].line" });
    expect(canApprove(v)).toBe(false);
  });
});

describe("editBeat", () => {
  it("changes only what the patch names", () => {
    const next = editBeat(skit, "l4", { expression: "smug", pauseBeforeMs: null });
    const [before, after] = [skit, next].map((s) => (s.beats as Record<string, unknown>[]).find((b) => b.id === "l4")!);
    expect(after.expression).toBe("smug");
    expect(after.pauseBeforeMs).toBeUndefined();
    expect(after.actions).toEqual(before.actions);
    expect(after.delivery).toBe(before.delivery);
    expect(skit.beats).not.toBe(next.beats);
  });

  it("keeps a slam's timing when only its words change, and adds new ones on the last word", () => {
    const one = editBeat(skit, "l1", { slams: ["SEEN"] });
    const retimed = { ...one, beats: (one.beats as Record<string, unknown>[]).map((b) => (b.id === "l1" ? { ...b, text: [{ type: "slam", value: "SEEN", at: { ms: 200 } }] } : b)) };
    const two = editBeat(retimed, "l1", { slams: ["SEEN BY 6", "0 REPLIES"] });
    expect(beatsOf(two).find((b) => b.id === "l1")?.slams).toEqual(["SEEN BY 6", "0 REPLIES"]);
    const text = (two.beats as Record<string, unknown>[]).find((b) => b.id === "l1")!.text as Record<string, unknown>[];
    expect(text[0].at).toEqual({ ms: 200 });
    const line = beatsOf(retimed).find((b) => b.id === "l1")!.line!;
    const last = line.trim().split(/\s+/).at(-1)!.replace(/[^\p{L}\p{N}']/gu, "").toLowerCase();
    expect(text[1].at).toMatchObject({ word: last });
  });

  it("retargets a slam when the line no longer says the old word", () => {
    const next = editBeat(skit, "l12", { line: "What? That's not saving. That's Wasting!" });
    const text = (next.beats as Record<string, unknown>[]).find((b) => b.id === "l12")!.text as { at: { word: string } }[];
    expect(text[0].at.word).toBe("wasting");
    expect(judgeSkit(next).check.findings.some((f) => f.check === "slam-anchor")).toBe(false);
  });

  it("warns when the slam chip and the word it hits disagree", () => {
    const next = editBeat(skit, "l12", { slams: ["WASTING!"] });
    const text = (next.beats as Record<string, unknown>[]).find((b) => b.id === "l12")!.text as { at: { word: string } }[];
    expect(text[0].at.word).toBe("mom");
    const v = judgeSkit(next);
    expect(v.check.findings.some((f) => f.check === "slam-anchor")).toBe(true);
    expect(v.check.ok).toBe(true);

    const beats = (skit.beats as Record<string, unknown>[]).map((b) =>
      b.id === "l12" ? { ...b, line: "That's wasting.", text: [{ type: "slam", value: "WASTING!", at: { word: "saving", occurrence: 1 } }] } : b,
    );
    const stale = { ...skit, beats } as Skit;
    expect(judgeSkit(stale).check.ok).toBe(false);
    const fixed = alignSlams(stale);
    expect(fixed.changed).toBe(true);
    const anchored = ((fixed.skit as Skit & { beats: Record<string, unknown>[] }).beats.find((b) => b.id === "l12")!.text as { at: { word: string } }[])[0];
    expect(anchored.at.word).toBe("wasting");
    expect(judgeSkit(fixed.skit).check.findings.some((f) => f.check === "slam-anchor")).toBe(false);
  });
});

describe("withBeats", () => {
  it("replaces beats and keeps the staging", () => {
    const edited = editBeat(skit, "l2", { line: "Seen." });
    const merged = withBeats({ ...skit }, edited.beats);
    expect(merged.cast).toEqual(skit.cast);
    expect(beatsOf(merged).find((b) => b.id === "l2")?.line).toBe("Seen.");
  });

  it("accepts a reorder and refuses a skit with no spoken line", () => {
    const beats = [...(skit.beats as Record<string, unknown>[])];
    const swapped = withBeats(skit, [beats[1], beats[0], ...beats.slice(2)]);
    expect(beatsOf(swapped).map((b) => b.id).slice(0, 2)).toEqual([beats[1]!.id, beats[0]!.id]);
    const silenced = beats.map((b) => ({ ...b, line: " " }));
    expect(() => withBeats(skit, silenced)).toThrow(/spoken line/);
  });
});

describe("reshaping the beat list", () => {
  it("adds, duplicates, reorders, and refuses to delete the last spoken line", () => {
    const added = addBeat(skit, "l2");
    expect(beatsOf(added.skit).map((b) => b.id)).toEqual(["l1", "l2", added.id, "l3", "l4", "r1", "l5", "l6", "l7", "l8", "l9", "l10", "l11", "l12"]);
    expect(beatsOf(added.skit).find((b) => b.id === added.id)).toMatchObject({ speaker: beatsOf(skit).find((b) => b.id === "l2")?.speaker });
    const copy = duplicateBeat(skit, "l2");
    expect(beatsOf(copy.skit).find((b) => b.id === copy.id)?.line).toBe(beatsOf(skit).find((b) => b.id === "l2")?.line);
    const moved = moveBeat(skit, "l2", "up");
    expect(beatsOf(moved).map((b) => b.id).slice(0, 2)).toEqual(["l2", "l1"]);
    const dropped = deleteBeat(skit, "l2");
    expect(beatsOf(dropped).some((b) => b.id === "l2")).toBe(false);
    let last = skit;
    for (const beat of beatsOf(skit).slice(0, -1)) last = deleteBeat(last, beat.id);
    expect(() => deleteBeat(last, beatsOf(last)[0]!.id)).toThrow(/spoken line/);
  });
});

describe("a multi-scene skit", () => {
  // The committed skit cut in two: l1–l4 and the reaction in the living room, the rest in the cafe.
  const { beats, ...rest } = skit as Skit & { beats: Record<string, unknown>[] };
  delete rest.set;
  const scenes = { ...rest, scenes: [{ id: "home", set: "living-1", beats: beats.slice(0, 5) }, { id: "cafe", set: "cafe-1", pov: "POV: later", beats: beats.slice(5) }] } as Skit;

  it("reads every beat in play order, each with its scene", () => {
    expect(beatsOf(scenes).map((b) => b.id)).toEqual(beatsOf(skit).map((b) => b.id));
    expect(beatsOf(scenes)[5]).toMatchObject({ id: "l5", scene: "cafe" });
    expect(scenesOf(scenes)).toEqual([
      { id: "home", set: "living-1", beatIds: ["l1", "l2", "l3", "l4", "r1"] },
      { id: "cafe", set: "cafe-1", pov: "POV: later", beatIds: ["l5", "l6", "l7", "l8", "l9", "l10", "l11", "l12"] },
    ]);
    expect(scenesOf(skit)).toEqual([]);
    expect(judgeSkit(scenes).check.errors).toBe(0);
  });

  it("edits a beat in its own scene and keeps the scenes as they were", () => {
    const next = editBeat(scenes, "l6", { line: "Seen." }) as Skit & { scenes: { id: string; beats: { id: string; line?: string }[] }[] };
    expect(next.scenes.map((sc) => sc.beats.length)).toEqual([5, 8]);
    expect(next.scenes[1]!.beats[1]).toMatchObject({ id: "l6", line: "Seen." });
    expect(next).not.toHaveProperty("beats");
  });

  it("takes the editor's beats back into their scenes, and nothing else", () => {
    const edited = editBeat(scenes, "l2", { line: "We saw it." });
    const merged = withBeats(scenes, allBeats(edited)) as Skit & { scenes: { set: string; beats: unknown[] }[] };
    expect(merged.scenes.map((sc) => [sc.set, sc.beats.length])).toEqual([["living-1", 5], ["cafe-1", 8]]);
    expect(beatsOf(merged).find((b) => b.id === "l2")?.line).toBe("We saw it.");
    expect(withBeats(scenes, allBeats(edited), scenePlanOf(edited)).scenes).toBeDefined();
    expect(() => withBeats(scenes, allBeats(scenes).slice(1))).toThrow(/which scene/);
    const moved = setSceneSet(scenes, "cafe", "plain-1") as Skit & { scenes: { id: string; set: string }[] };
    expect(moved.scenes.find((sc) => sc.id === "cafe")?.set).toBe("plain-1");
  });

  it("points a finding in a later scene at the editor's beat number", () => {
    const v = judgeSkit(editBeat(scenes, "l6", { line: "   " }));
    const blank = v.check.findings.find((f) => f.check === "blank-line");
    expect(blank?.path).toBe("scenes[1].beats[1].line");
    expect(findingTarget(scenes, blank?.path as string)).toEqual({ beat: 7, field: "line" });
    expect(findingTarget(skit, "beats[1].line")).toEqual({ beat: 2, field: "line" });
    expect(findingTarget(skit, "cast[0]")).toBeNull();
  });
});
