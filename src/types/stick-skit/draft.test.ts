import { describe, expect, it } from "vitest";

import groupChat from "@/lib/tamtree/mock/stick/group-chat.skit.json";
import type { Skit } from "@/lib/tamtree/stage-flows";
import { beatsOf, canApprove, editBeat, judgeSkit, withBeats } from "./draft";

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

  it("keeps a slam's timing when only its words change, and adds new ones", () => {
    const one = editBeat(skit, "l1", { slams: ["SEEN"] });
    const retimed = { ...one, beats: (one.beats as Record<string, unknown>[]).map((b) => (b.id === "l1" ? { ...b, text: [{ type: "slam", value: "SEEN", at: { ms: 200 } }] } : b)) };
    const two = editBeat(retimed, "l1", { slams: ["SEEN BY 6", "0 REPLIES"] });
    expect(beatsOf(two).find((b) => b.id === "l1")?.slams).toEqual(["SEEN BY 6", "0 REPLIES"]);
    const text = (two.beats as Record<string, unknown>[]).find((b) => b.id === "l1")!.text as Record<string, unknown>[];
    expect(text[0].at).toEqual({ ms: 200 });
  });
});

describe("withBeats", () => {
  it("replaces beats and keeps the staging", () => {
    const edited = editBeat(skit, "l2", { line: "Seen." });
    const merged = withBeats({ ...skit }, edited.beats);
    expect(merged.cast).toEqual(skit.cast);
    expect(beatsOf(merged).find((b) => b.id === "l2")?.line).toBe("Seen.");
  });

  it("refuses added, dropped or reordered beats", () => {
    const beats = skit.beats as unknown[];
    expect(() => withBeats(skit, beats.slice(1))).toThrow(/not added, removed or reordered/);
    expect(() => withBeats(skit, [beats[1], beats[0], ...beats.slice(2)])).toThrow();
  });
});
