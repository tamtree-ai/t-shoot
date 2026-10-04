import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { LocalStickAdapter } from "@/lib/tamtree/local/local-adapter";
import { StickStageClient } from "@/lib/tamtree/local/stickstage";
import { localVoice, pcm16Wav, wavMs, type Tts } from "@/lib/tamtree/local/tts";
import type { Writer } from "@/lib/tamtree/local/writer";
import { readStageOutput } from "@/lib/tamtree/read-output";
import { StickProduceOut, StickPromptOut, StickRepairOut, StickScriptOut } from "@/lib/tamtree/stage-flows";
import { isTerminal, type RunOutputOut } from "@/lib/tamtree/types";
import { DEFAULT_VOICE_MAP, STICK_VOICES, STICK_VOICES_LOCAL } from "@/types/stick-skit/catalog";

import { adapterContract } from "./adapter.contract";

/** Standalone plan §2: `local` passes the adapter contract suite with a fake StickStage and a fake TTS. */
const VERSION = "c1-test";
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const MP4 = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypisom"), ...new Array(200).fill(7)]);
const skit = { schemaVersion: 2, meta: { title: "Plant" }, set: "office-1", cast: [{ id: "milo", character: "milo" }, { id: "june", character: "june" }], beats: [] };
const lines = [
  { id: "b1", speaker: "june", character: "june", text: "Did you water the plant?" },
  { id: "b2", speaker: "milo", character: "milo", text: "Define water." },
];
const validated = { ok: true, catalogVersion: VERSION, skit, lines, estimatedDurationSec: 6, warnings: [{ path: "set", message: "no set in the reply" }], check: { ok: true, errors: 0, warnings: 0, findings: [] } };

type Fake = { calls: string[]; uploads: { names: string[]; voice: { lines: { id: string; text: string; durationMs?: number }[] } }[]; invalidFirstReply?: boolean; failCheck?: boolean; jobDelayMs?: number };

/** The StickStage render service, as far as the stick flows use it. */
function fakeStickStage(f: Fake): typeof fetch {
  let replies = 0;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const job = (status: string) => ({
    id: "job1",
    status,
    title: "Plant",
    durationSec: 6.2,
    outputs: {
      mp4: { url: "/jobs/job1/files/mp4", type: "video/mp4", bytes: MP4.byteLength, name: "plant.mp4" },
      srt: { url: "/jobs/job1/files/srt", type: "application/x-subrip", bytes: 10, name: "plant.srt" },
      txt: { url: "/jobs/job1/files/txt", type: "text/plain", bytes: 5, name: "plant.txt" },
      manifest: { url: "/jobs/job1/files/manifest", type: "application/json", bytes: 40, name: "plant.json" },
    },
  });
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    f.calls.push(`${init?.method ?? "GET"} ${u.pathname}`);
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    if (body?.catalog_version && body.catalog_version !== VERSION) return json(409, { error: { code: "catalog-mismatch", message: "other catalog" } });
    switch (u.pathname) {
      case "/write/prompt":
        return json(200, { system: "Reply with JSON.", prompt: "Topic: plants", writer: "w2", catalogVersion: VERSION });
      case "/validate":
        if (body?.reply !== undefined && f.invalidFirstReply && replies++ === 0) return json(422, { error: { code: "invalid-reply", message: "not JSON", repair: { prompt: "Fix it." } } });
        if (f.failCheck && body?.skit) return json(200, { ...validated, ok: false, check: { ok: false, errors: 1, warnings: 0, findings: [{ message: "unknown set" }] } });
        return json(200, body?.brief ? { ...validated, premise: { title: "Plant" } } : validated);
      case "/render": {
        const form = init!.body as FormData;
        const names = form.getAll("audio").map((x) => (x as File).name);
        f.uploads.push({ names, voice: JSON.parse(String(form.get("voice"))) });
        return json(202, { id: "job1", status: "queued" });
      }
      case "/jobs/job1/events": {
        const enc = new TextEncoder();
        const stream = new ReadableStream({
          async start(c) {
            c.enqueue(enc.encode(`: ping\n\ndata: ${JSON.stringify({ id: "job1", status: "running" })}\n\n`));
            await new Promise((r) => setTimeout(r, f.jobDelayMs ?? 0));
            c.enqueue(enc.encode(`data: ${JSON.stringify(job("succeeded"))}\n\n`));
            c.close();
          },
        });
        return new Response(stream, { headers: { "content-type": "text/event-stream" } });
      }
      case "/jobs/job1/files/mp4":
        return new Response(MP4);
      case "/jobs/job1/files/srt":
        return new Response("1\n00:00:00,000 --> 00:00:01,000\nDid you water the plant?\n");
      case "/jobs/job1/files/txt":
        return new Response("Plant");
      case "/jobs/job1/files/manifest":
        return json(200, { title: "Plant", durationSec: 6.2, reminder: "Label it as AI voice." });
      case "/jobs/job1":
        return json(200, job("cancelled"));
    }
    return json(404, { error: { code: "not-found", message: u.pathname } });
  }) as typeof fetch;
}

const silence = pcm16Wav(new Float32Array(2400), 24000);
const fakeTts = (spoken: { text: string; voice: string }[] = []): Tts => ({
  id: "fake",
  speak: async (text, voice) => {
    spoken.push({ text, voice });
    return silence;
  },
});
const fakeWriter = (replies: string[] = []): Writer => ({
  label: "fake",
  write: async (_msg, shape) => {
    replies.push(shape);
    return '{"title":"Plant","scenes":[{"lines":[{"who":"june","text":"Did you water the plant?"}]}]}';
  },
  writeObject: async (msg, schema) => {
    replies.push("object");
    return schema.parse({ hooks: ["Plants can't text back.", "Your fern has opinions.", "It was plastic all along."] });
  },
});

function local(f: Fake = { calls: [], uploads: [] }, o: { writer?: Writer | null; tts?: Tts } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tamshoot-local-"));
  dirs.push(dir);
  return new LocalStickAdapter({
    dir,
    stickstage: new StickStageClient({ baseUrl: "http://stickstage.test", token: "t", fetch: fakeStickStage(f) }),
    tts: o.tts ?? fakeTts(),
    writer: o.writer === null ? undefined : (o.writer ?? fakeWriter()),
    pollMs: 5,
  });
}

const brief = { topic: "plants", cast: [{ id: "milo", character: "milo" }, { id: "june", character: "june" }] };
const draft = () => ({ mode: "draft" as const, catalog_version: VERSION, brief: { ...brief, topic: `plants ${Math.random()}` } });

adapterContract("local", {
  adapter: () => local(),
  timeoutMs: 2_000,
  reuse: false,
  sample: {
    flow: "stick-script",
    input: draft,
    check: (output: RunOutputOut) => {
      const out = StickScriptOut.parse(readStageOutput("stick-script", output));
      expect(out.lines).toHaveLength(2);
    },
  },
});

async function settle(a: LocalStickAdapter, runId: string) {
  for (;;) {
    const r = await a.getRun(runId);
    if (isTerminal(r.status)) return r;
    await new Promise((res) => setTimeout(res, 5));
  }
}

describe("local stick-script", () => {
  it("prompt → write → validate, as the plugin flow does, at no cost", async () => {
    const f: Fake = { calls: [], uploads: [] };
    const a = local(f);
    const { run } = await a.triggerRun("stick-script", draft(), { idempotencyKey: "s1" });
    const done = await settle(a, run.id);
    expect(done).toMatchObject({ status: "completed", total_cost_usd: 0 });
    const out = StickScriptOut.parse(readStageOutput("stick-script", await a.getRunOutput(run.id)));
    expect(StickScriptOut.parse(out)).toEqual(out);
    expect(out).toMatchObject({ premise: { title: "Plant" }, warnings: ["set: no set in the reply"], estimated_duration_s: 6 });
    expect(f.calls).toEqual(["POST /write/prompt", "POST /validate"]);
  });

  it("asks the model once more when the reply can't be used", async () => {
    const shapes: string[] = [];
    const f: Fake = { calls: [], uploads: [], invalidFirstReply: true };
    const a = local(f, { writer: fakeWriter(shapes) });
    const { run } = await a.triggerRun("stick-script", draft(), { idempotencyKey: "s2" });
    expect((await settle(a, run.id)).status).toBe("completed");
    expect(shapes).toEqual(["draft", "repair"]);
    expect(f.calls.filter((c) => c === "POST /validate")).toHaveLength(2);
  });

  it("stops on a stale catalog before the model is asked", async () => {
    const shapes: string[] = [];
    const a = local(undefined, { writer: fakeWriter(shapes) });
    const { run } = await a.triggerRun("stick-script", { ...draft(), catalog_version: "c1-old" }, { idempotencyKey: "s3" });
    expect(await settle(a, run.id)).toMatchObject({ status: "failed", error: { code: "catalog_mismatch" } });
    expect(shapes).toEqual([]);
  });

  it("without a writer model, fails with a message that says what to do", async () => {
    const a = local(undefined, { writer: null });
    const { run } = await a.triggerRun("stick-script", draft(), { idempotencyKey: "s4" });
    const r = await settle(a, run.id);
    expect(r).toMatchObject({ status: "failed", error: { code: "writer_unavailable" } });
    expect(String((r.error as { message: string }).message)).toMatch(/paste a chatbot's reply/);
  });

  it("refuses flows that need Tamtree", async () => {
    const a = local();
    const { run } = await a.triggerRun("studio-clip", { scene_key: "s", visual_prompt: "x", seconds: 6, take: 1 }, { idempotencyKey: "c1" });
    expect(await settle(a, run.id)).toMatchObject({ status: "failed", error: { code: "not_available" } });
  });
});

describe("local copy-paste writer (D2)", () => {
  it("prompt mode returns the words for a chatbot and asks no model", async () => {
    const shapes: string[] = [];
    const a = local(undefined, { writer: null });
    const { run } = await a.triggerRun("stick-script", { mode: "prompt", catalog_version: VERSION, brief }, { idempotencyKey: "cp1" });
    expect((await settle(a, run.id)).status).toBe("completed");
    expect(StickPromptOut.parse(readStageOutput("stick-script", await a.getRunOutput(run.id)))).toMatchObject({ system: "Reply with JSON.", prompt: "Topic: plants" });
    expect(shapes).toEqual([]);
  });

  it("reply mode stages a pasted reply, and gives back the repair prompt for one it can't use", async () => {
    const a = local({ calls: [], uploads: [], invalidFirstReply: true }, { writer: null });
    const bad = await a.triggerRun("stick-script", { mode: "reply", catalog_version: VERSION, reply: "lol", brief }, { idempotencyKey: "cp2" });
    expect((await settle(a, bad.run.id)).status).toBe("completed");
    expect(StickRepairOut.parse(readStageOutput("stick-script", await a.getRunOutput(bad.run.id)))).toMatchObject({ repair_prompt: "Fix it." });
    const good = await a.triggerRun("stick-script", { mode: "reply", catalog_version: VERSION, reply: "{}", brief }, { idempotencyKey: "cp3" });
    await settle(a, good.run.id);
    expect(StickScriptOut.parse(readStageOutput("stick-script", await a.getRunOutput(good.run.id))).lines).toHaveLength(2);
  });
});

describe("local text helpers", () => {
  it("run on the owner's model, held to the contract's schema", async () => {
    const a = local();
    const { run } = await a.triggerRun("studio-hooks", { line: "Did you water the plant?", topic: "plants" }, { idempotencyKey: "h1" });
    expect((await settle(a, run.id)).status).toBe("completed");
    expect(readStageOutput("studio-hooks", await a.getRunOutput(run.id)).hooks).toHaveLength(3);
  });

  it("without a model, fail with writer_unavailable", async () => {
    const a = local(undefined, { writer: null });
    const { run } = await a.triggerRun("studio-titles", { title: "Plant", lines: [] }, { idempotencyKey: "h2" });
    expect(await settle(a, run.id)).toMatchObject({ status: "failed", error: { code: "writer_unavailable" } });
  });
});

describe("local stick-produce", () => {
  const voices = { milo: "Puck", june: "am_echo" };

  it("validates, voices each line exactly, renders, and stores four assets with the MP4's digest", async () => {
    const spoken: { text: string; voice: string }[] = [];
    const f: Fake = { calls: [], uploads: [] };
    const a = local(f, { tts: fakeTts(spoken) });
    const { run } = await a.triggerRun("stick-produce", { catalog_version: VERSION, skit, voices }, { idempotencyKey: "p1" });
    expect(await settle(a, run.id)).toMatchObject({ status: "completed", total_cost_usd: 0 });
    const out = readStageOutput("stick-produce", await a.getRunOutput(run.id));
    expect(StickProduceOut.parse(out)).toEqual(out);
    expect(spoken).toEqual([
      { text: "Did you water the plant?", voice: "am_echo" },
      { text: "Define water.", voice: "am_puck" },
    ]);
    expect(f.uploads[0]!.names).toEqual(["b1.wav", "b2.wav"]);
    expect(f.uploads[0]!.voice.lines.map((l) => l.durationMs)).toEqual([100, 100]);
    const mp4 = await a.getAssetContent(out.mp4_asset_id);
    expect(mp4).toMatchObject({ mimeType: "video/mp4", size: MP4.byteLength });
    expect(new Uint8Array(await new Response(mp4.body).arrayBuffer())).toEqual(MP4);
    const ranged = await a.getAssetContent(out.mp4_asset_id, { start: 4, end: 7 });
    expect(new TextDecoder().decode(await new Response(ranged.body).arrayBuffer())).toBe("ftyp");
    expect(out).toMatchObject({ duration_s: 6.2, reminder: "Label it as AI voice." });
    expect((await a.listRunAssets(run.id)).map((x) => x.id)).toContain(out.srt_asset_id);
  });

  it("refuses a skit that fails the self-check before any voice is made", async () => {
    const spoken: { text: string; voice: string }[] = [];
    const a = local({ calls: [], uploads: [], failCheck: true }, { tts: fakeTts(spoken) });
    const { run } = await a.triggerRun("stick-produce", { catalog_version: VERSION, skit, voices }, { idempotencyKey: "p2" });
    expect(await settle(a, run.id)).toMatchObject({ status: "failed", error: { code: "invalid_skit" } });
    expect(spoken).toEqual([]);
  });

  it("cancels a render in flight and tells StickStage", async () => {
    const f: Fake = { calls: [], uploads: [], jobDelayMs: 300 };
    const a = local(f);
    const { run } = await a.triggerRun("stick-produce", { catalog_version: VERSION, skit, voices }, { idempotencyKey: "p3" });
    for (let i = 0; i < 200 && !f.calls.includes("GET /jobs/job1/events"); i++) await new Promise((r) => setTimeout(r, 5));
    await a.cancelRun(run.id);
    expect((await settle(a, run.id)).status).toBe("cancelled");
    await new Promise((r) => setTimeout(r, 20));
    expect(f.calls).toContain("DELETE /jobs/job1");
  });

  it("another process sees the run, and a run whose process died is failed, not resumed", async () => {
    const a = local();
    const { run } = await a.triggerRun("stick-produce", { catalog_version: VERSION, skit, voices }, { idempotencyKey: "p4" });
    await settle(a, run.id);
    const other = new LocalStickAdapter({ dir: a.store.dir, stickstage: new StickStageClient({ baseUrl: "http://x" }), tts: fakeTts(), pollMs: 5 });
    expect((await other.getRun(run.id)).status).toBe("completed");
    expect((await other.listRunEvents(run.id)).items.at(-1)!.event).toBe("run_complete");

    const orphan = a.store.create("stick-produce", {}, "orphan", undefined);
    const file = path.join(a.store.dir, "runs", orphan.id, "run.json");
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf8")), status: "running", owner: { pid: 2 ** 22 + 1, host: os.hostname() } }));
    expect(await other.getRun(orphan.id)).toMatchObject({ status: "failed", error: { code: "interrupted" } });
  });
});

describe("local voices", () => {
  it("every saved Tamtree voice maps to a Kokoro voice the standalone picker offers (D3)", () => {
    const offered = STICK_VOICES_LOCAL.map((v) => v.id);
    for (const v of STICK_VOICES) expect(offered).toContain(localVoice(v.id));
    for (const c of Object.keys(DEFAULT_VOICE_MAP)) expect(offered).toContain(localVoice(DEFAULT_VOICE_MAP[c]));
  });

  it("maps saved Gemini names to Kokoro, passes Kokoro ids through, and falls back to Zephyr's", () => {
    expect(localVoice("Puck")).toBe("am_puck");
    expect(localVoice("Charon")).toBe("am_onyx");
    expect(localVoice("bf_emma")).toBe("bf_emma");
    expect(localVoice("Nobody")).toBe("af_sky");
    expect(localVoice(undefined)).toBe("af_sky");
  });

  it("writes 16-bit PCM WAV and reads its length back", () => {
    expect(wavMs(pcm16Wav(new Float32Array(48000), 24000))).toBe(2000);
  });
});
