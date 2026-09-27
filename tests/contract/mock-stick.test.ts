import { describe, expect, it } from "vitest";

import { stickCatalog } from "@/lib/stick/registry";
import { MockTamtreeAdapter } from "@/lib/tamtree/mock/mock-adapter";
import { readStageOutput } from "@/lib/tamtree/read-output";
import { StickProduceOut, StickScriptOut } from "@/lib/tamtree/stage-flows";

/** K1.2: the mock's stick-script / stick-produce honour the 09 §5 contract. */
const fast = () => new MockTamtreeAdapter({ speed: 1000 });
const version = stickCatalog.version;
const brief = { topic: "group chats", cast: [{ id: "milo", character: "milo" }, { id: "june", character: "june" }], allowed_sets: ["cafe-1", "office-1"] };

async function settle(a: MockTamtreeAdapter, runId: string) {
  for (;;) {
    const r = await a.getRun(runId);
    if (["completed", "failed", "cancelled"].includes(r.status)) return r;
    await new Promise((res) => setTimeout(res, 5));
  }
}

async function run<F extends "stick-script" | "stick-produce">(a: MockTamtreeAdapter, flow: F, input: Parameters<MockTamtreeAdapter["triggerRun"]>[1], key: string) {
  const { run: r } = await a.triggerRun(flow, input as never, { idempotencyKey: key });
  return settle(a, r.id);
}

describe("mock stick-script", () => {
  it("drafts a multi-scene skit when the brief asks for scenes: its sets first, then unused allowed ones", async () => {
    const a = fast();
    const r = await run(a, "stick-script", { mode: "draft", catalog_version: version, brief: { ...brief, scenes: 3, sets: ["office-1"] } }, "ms1");
    expect(r.status).toBe("completed");
    const out = readStageOutput("stick-script", await a.getRunOutput(r.id));
    const scenes = (out.skit as { scenes: { set: string; beats: { line?: string }[] }[] }).scenes;
    expect(scenes.map((sc) => sc.set)).toEqual(["office-1", "cafe-1", expect.any(String)]);
    expect(new Set(scenes.map((sc) => sc.set)).size).toBe(3);
    expect(scenes.every((sc) => sc.beats[0]?.line)).toBe(true);
    expect(out.skit).not.toHaveProperty("beats");
    expect(out.lines).toHaveLength(12);
    expect(out.check).toMatchObject({ errors: 0 });
  });

  it("drafts the group-chat skit, staged and checked by the real stickstage package", async () => {
    const a = fast();
    const r = await run(a, "stick-script", { mode: "draft", catalog_version: version, brief }, "d1");
    expect(r.status).toBe("completed");
    expect(Number(r.total_cost_usd)).toBeGreaterThan(0);
    const out = readStageOutput("stick-script", await a.getRunOutput(r.id));
    expect(StickScriptOut.parse(out)).toEqual(out);
    expect(out.premise).toMatchObject({ template: "exchange" });
    expect(out.skit).toMatchObject({ set: "cafe-1" }); // the first allowed set
    expect(out.lines).toHaveLength(12);
    expect(out.lines[0]).toMatchObject({ speaker: "milo", character: "milo" });
    expect(out.estimated_duration_s).toBeGreaterThan(15);
    expect(out.check).toMatchObject({ errors: 0 });
  });

  it("revises the punchline only and keeps every beat id", async () => {
    const a = fast();
    const draft = readStageOutput("stick-script", await a.getRunOutput((await run(a, "stick-script", { mode: "draft", catalog_version: version, brief }, "d")).id));
    const r = await run(a, "stick-script", { mode: "revise", catalog_version: version, skit: draft.skit, note: "Land it harder." }, "r");
    const out = readStageOutput("stick-script", await a.getRunOutput(r.id));
    expect(out.premise).toBeUndefined();
    expect(out.lines.map((l) => l.id)).toEqual(draft.lines.map((l) => l.id));
    expect(out.lines.at(-1)!.text).toBe("Your mom. Obviously.");
    expect(out.lines.slice(0, -1)).toEqual(draft.lines.slice(0, -1));
  });

  it("stops on a stale catalog version at no cost", async () => {
    const a = fast();
    const r = await run(a, "stick-script", { mode: "draft", catalog_version: "c1-0000000000000000", brief }, "stale");
    expect(r.status).toBe("failed");
    expect(r.error).toMatchObject({ code: "catalog_mismatch" });
    expect(Number(r.total_cost_usd)).toBe(0);
  });
});

describe("mock stick-produce", () => {
  const voices = { milo: "Puck", june: "Kore" };

  async function draftSkit(a: MockTamtreeAdapter) {
    const r = await run(a, "stick-script", { mode: "draft", catalog_version: version, brief }, "draft");
    return readStageOutput("stick-script", await a.getRunOutput(r.id)).skit;
  }

  it("returns four real assets and a digest; a double Approve (same key) is one run", async () => {
    const a = fast();
    const skit = await draftSkit(a);
    const input = { catalog_version: version, skit, voices };
    const first = await a.triggerRun("stick-produce", input, { idempotencyKey: "approve" });
    const again = await a.triggerRun("stick-produce", input, { idempotencyKey: "approve" });
    expect(again.run.id).toBe(first.run.id);
    const r = await settle(a, first.run.id);
    expect(r.status).toBe("completed");
    const out = readStageOutput("stick-produce", await a.getRunOutput(r.id));
    expect(StickProduceOut.parse(out)).toEqual(out);
    const mp4 = await a.getAssetContent(out.mp4_asset_id);
    expect(mp4.mimeType).toBe("video/mp4");
    expect(mp4.size).toBeGreaterThan(100_000);
    const srt = await new Response((await a.getAssetContent(out.srt_asset_id)).body).text();
    expect(srt).toMatch(/^1\n00:00:00,000 --> /);
    expect(srt).toContain("Your mom.");
    expect(out.reminder).toBeTruthy();
  });

  it("refuses a skit that fails the self-check before any TTS", async () => {
    const a = fast();
    const skit = { ...(await draftSkit(a)), set: "no-such-set" };
    const r = await run(a, "stick-produce", { catalog_version: version, skit, voices }, "bad");
    expect(r.status).toBe("failed");
    expect(r.error).toMatchObject({ code: "invalid_skit" });
    expect(Number(r.total_cost_usd)).toBe(0);
  });
});
