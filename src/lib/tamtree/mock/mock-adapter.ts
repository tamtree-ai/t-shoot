/**
 * MockTamtreeAdapter — an in-memory Tamtree that behaves like /v1 (07-frontend-first §3).
 *
 * Real-shaped runs (queued → running → completed | failed | cancelled), real event
 * names, input-digest reuse like `shortvideo.reuse`, deterministic scenario presets and
 * failure injection. Everything is per-instance; nothing is persisted.
 */
import { createHash, randomUUID } from "node:crypto";

import { TamtreeError, type TamtreeAdapter, type TriggerOptions } from "../adapter";
import {
  STAGE_OUTPUT_PORT,
  type Beat,
  type ClipIn,
  type NarrateIn,
  type RenderIn,
  type ScriptIn,
  type StageFlow,
  type StageInput,
  type StageOutput,
  type StickProduceIn,
  type StickScriptIn,
  type StickScriptOut,
  type PublishIn,
  type TopicsIn,
  type HooksIn,
  type TitlesIn,
  type TranslateIn,
} from "../stage-flows";
import type {
  AssetContent,
  AssetOut,
  MessageAccepted,
  RunDetail,
  RunEventOut,
  RunEventPage,
  RunOut,
  RunOutputOut,
  UsageSummaryOut,
} from "../types";
import { topicsFromArticle } from "@/lib/topics";
import { MOCK_DURATIONS_MS, MOCK_PRICES_USD, THREE_HEARTS_BEATS } from "./fixtures";
import { stickProduceFiles, stickScriptOutput, type StickRenderFiles } from "./stick";

export const MOCK_SCENARIOS = ["happy", "three-hearts", "slow", "refusal", "over-limit"] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export type FailureCode = "provider_timeout" | "content_refused" | "budget_exceeded" | "internal_error" | "catalog_mismatch" | "invalid_skit";

export type MockOptions = {
  scenario?: MockScenario;
  /** 1 = nominal timings; 10 = ten times faster. */
  speed?: number;
  /** Workspace budget the `over-limit` scenario trips, in USD. */
  budgetUsd?: number;
  now?: () => Date;
};

type StoredAsset = { meta: AssetOut; bytes: Uint8Array };

type MockRun = {
  run: RunOut;
  flow: StageFlow;
  digest: string;
  events: RunEventOut[];
  output: RunOutputOut | null;
  assetIds: string[];
  timers: ReturnType<typeof setTimeout>[];
  waiters: (() => void)[];
};

const FAILURE_MESSAGES: Record<FailureCode, string> = {
  provider_timeout: "The video provider did not answer in time.",
  content_refused: "The video provider refused to generate this shot.",
  budget_exceeded: "The workspace budget for this month is exhausted.",
  internal_error: "The run failed.",
  catalog_mismatch: "The skit was written against another StickStage catalog; nothing was paid for.",
  invalid_skit: "StickStage refused the skit before any audio was paid for.",
};

export class MockTamtreeAdapter implements TamtreeAdapter {
  readonly kind = "mock" as const;

  private readonly scenario: MockScenario;
  private timeScale: number;
  private readonly budgetUsd: number;
  private readonly now: () => Date;

  private readonly runs = new Map<string, MockRun>();
  private readonly byIdempotencyKey = new Map<string, string>();
  /** input digest → completed run id (reuse, like `shortvideo.reuse`). */
  private readonly reuse = new Map<string, string>();
  /** input digest → failed attempts so far (scenario failures hit the first attempt only). */
  private readonly attempts = new Map<string, number>();
  /** studio-clip scene keys in first-seen order (scenario failures pick by position). */
  private readonly clipScenes: string[] = [];
  private readonly assets = new Map<string, StoredAsset>();
  private readonly forcedFailures: { flow: StageFlow; code: FailureCode }[] = [];
  private spentUsd = 0;

  constructor(opts: MockOptions = {}) {
    this.scenario = opts.scenario ?? "happy";
    this.timeScale = 1 / (opts.speed ?? 1);
    this.budgetUsd = opts.budgetUsd ?? 2;
    this.now = opts.now ?? (() => new Date());
  }

  // ── dev controls (the /dev/mock panel; never in production builds) ──────────
  /** Make the next run of `flow` fail with `code`. */
  failNext(flow: StageFlow, code: FailureCode): void {
    this.forcedFailures.push({ flow, code });
  }

  setSpeed(speed: number): void {
    this.timeScale = 1 / speed;
  }

  // ── TamtreeAdapter ───────────────────────────────────────────────────────
  async triggerRun<F extends StageFlow>(flow: F, input: StageInput[F], opts: TriggerOptions): Promise<RunDetail> {
    const replay = this.byIdempotencyKey.get(opts.idempotencyKey);
    if (replay) return { run: { ...this.mustGet(replay).run }, steps: [] };

    const digest = inputDigest(flow, input);
    const id = `run_${randomUUID()}`;
    const run: RunOut = {
      id,
      flow_id: flow,
      flow_version: 1,
      status: "queued",
      error: null,
      created_at: this.iso(),
      started_at: null,
      completed_at: null,
      metadata: opts.metadata ?? null,
      output_ref: null,
      trigger_type: "api",
      tokens_in: 0,
      tokens_out: 0,
      total_cost_usd: 0,
      metered_steps: 0,
      pinned_steps: 0,
      unpriced_steps: 0,
    };
    const mock: MockRun = { run, flow, digest, events: [], output: null, assetIds: [], timers: [], waiters: [] };
    this.runs.set(id, mock);
    this.byIdempotencyKey.set(opts.idempotencyKey, id);

    this.schedule(mock, input);
    return { run: { ...run }, steps: [] };
  }

  async getRun(runId: string): Promise<RunOut> {
    return { ...this.mustGet(runId).run };
  }

  async getRunOutput(runId: string): Promise<RunOutputOut> {
    const mock = this.mustGet(runId);
    return mock.output ?? { output_ref: null, ports: {} };
  }

  async *streamRunEvents(
    runId: string,
    opts: { afterSeq?: number; signal?: AbortSignal } = {},
  ): AsyncIterable<RunEventOut> {
    const mock = this.mustGet(runId);
    let next = (opts.afterSeq ?? 0) + 1;
    while (!opts.signal?.aborted) {
      while (next <= mock.events.length) {
        yield mock.events[next - 1];
        next++;
      }
      if (isTerminal(mock.run.status)) return;
      await new Promise<void>((resolve) => {
        mock.waiters.push(resolve);
        opts.signal?.addEventListener("abort", () => resolve(), { once: true });
      });
    }
  }

  async listRunEvents(runId: string, opts: { afterSeq?: number; limit?: number } = {}): Promise<RunEventPage> {
    const mock = this.mustGet(runId);
    const after = opts.afterSeq ?? 0;
    const limit = opts.limit ?? 100;
    const items = mock.events.filter((e) => e.seq > after).slice(0, limit);
    const last = items.at(-1);
    const more = last !== undefined && mock.events.some((e) => e.seq > last.seq);
    return { items, next_after_seq: more ? last.seq : null };
  }

  async cancelRun(runId: string): Promise<MessageAccepted> {
    const mock = this.mustGet(runId);
    if (isTerminal(mock.run.status)) {
      throw new TamtreeError("Run is already finished.", 409, "conflict");
    }
    mock.timers.forEach(clearTimeout);
    mock.timers = [];
    mock.run.status = "cancelled";
    mock.run.completed_at = this.iso();
    this.emit(mock, "run_failed", { error: { code: "cancelled", message: "Cancelled." } });
    return { run_id: runId };
  }

  async getUsageSummary(): Promise<UsageSummaryOut> {
    const cost = this.spentUsd.toFixed(6);
    const d = this.now();
    return {
      month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      cost_usd: cost,
      cost_exact: cost,
      cost_estimated: "0",
      tokens_in: 0,
      tokens_out: 0,
      unpriced_calls: 0,
      storage_bytes: [...this.assets.values()].reduce((n, a) => n + a.meta.size_bytes, 0),
      budget:
        this.scenario === "over-limit"
          ? {
              enabled: true,
              monthly_limit_usd: this.budgetUsd.toFixed(2),
              warn_threshold_pct: 80,
              unpriced_block_count: 0,
              created_at: this.iso(),
              updated_at: this.iso(),
            }
          : null,
    };
  }

  async listRunAssets(runId: string): Promise<AssetOut[]> {
    return this.mustGet(runId).assetIds.map((id) => ({ ...this.assets.get(id)!.meta }));
  }

  async getAssetContent(assetId: string, range?: { start: number; end?: number }): Promise<AssetContent> {
    const asset = this.assets.get(assetId);
    if (!asset) throw new TamtreeError("Asset not found.", 404, "not_found");
    const size = asset.bytes.byteLength;
    const start = range?.start ?? 0;
    const end = Math.min(range?.end ?? size - 1, size - 1);
    const bytes = asset.bytes.slice(start, end + 1);
    return {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      mimeType: asset.meta.mime_type,
      size,
      range: range ? { start, end } : null,
    };
  }

  // ── run simulation ──────────────────────────────────────────────────────
  private schedule<F extends StageFlow>(mock: MockRun, input: StageInput[F]): void {
    const flow = mock.flow as F;
    const reusedFrom = this.reuse.get(mock.digest);
    const failure = reusedFrom ? null : this.failureFor(flow, input, mock.digest);
    const nominal = MOCK_DURATIONS_MS[flow] * (this.scenario === "slow" && flow === "studio-clip" ? 3 : 1);
    const duration = reusedFrom ? 150 : nominal;
    const stepId = `${flow}.main`;

    this.at(mock, 100, () => {
      mock.run.status = "running";
      mock.run.started_at = this.iso();
      this.emit(mock, "step_start", { step_id: stepId }, stepId);
    });

    this.at(mock, 100 + duration, () => {
      if (failure) {
        // A metered step that charged nothing: the UI may truthfully say "not charged".
        mock.run.metered_steps = 1;
        this.emit(mock, "usage", { cost_usd: "0", tokens_in: 0, tokens_out: 0 }, stepId);
        mock.run.status = "failed";
        mock.run.error = { code: failure, message: FAILURE_MESSAGES[failure] };
        mock.run.completed_at = this.iso();
        this.emit(mock, "run_failed", { error: mock.run.error });
        return;
      }

      const cost = reusedFrom ? 0 : MOCK_PRICES_USD[flow];
      const result = reusedFrom
        ? this.reusedOutput(flow, reusedFrom)
        : this.produce(flow, input, mock);
      mock.run.metered_steps = cost > 0 || reusedFrom ? 1 : 0;
      mock.run.total_cost_usd = cost;
      this.spentUsd += cost;
      this.emit(mock, "usage", { cost_usd: cost.toFixed(6), tokens_in: 0, tokens_out: 0 }, stepId);
      this.emit(mock, "step_complete", { step_id: stepId }, stepId);

      mock.output = { output_ref: `out_${mock.run.id}`, ports: { [STAGE_OUTPUT_PORT]: [{ json: result }] } };
      mock.run.output_ref = mock.output.output_ref;
      mock.run.status = "completed";
      mock.run.completed_at = this.iso();
      if (!reusedFrom) this.reuse.set(mock.digest, mock.run.id);
      this.emit(mock, "run_complete", { output_ref: mock.output.output_ref });
    });
  }

  private failureFor<F extends StageFlow>(flow: F, input: StageInput[F], digest: string): FailureCode | null {
    const forced = this.forcedFailures.findIndex((f) => f.flow === flow);
    if (forced >= 0) return this.forcedFailures.splice(forced, 1)[0].code;

    if (flow === "studio-clip" && this.scenario === "over-limit" && this.spentUsd + MOCK_PRICES_USD[flow] > this.budgetUsd) {
      return "budget_exceeded";
    }

    // The stick flows stop where the real ones do: a catalog mismatch, or a skit StickStage refuses.
    if (flow === "stick-script") {
      const out = stickScriptOutput(input as StickScriptIn);
      return typeof out === "string" ? out : null;
    }
    if (flow === "stick-produce") {
      const out = stickProduceFiles(input as StickProduceIn);
      return typeof out === "string" ? out : null;
    }

    // Scenario failures hit a given scene's first attempt only, so "Try again" succeeds.
    const tries = this.attempts.get(digest) ?? 0;
    this.attempts.set(digest, tries + 1);
    if (flow !== "studio-clip" || tries > 0) return null;

    const sceneKey = (input as ClipIn).scene_key;
    if (!this.clipScenes.includes(sceneKey)) this.clipScenes.push(sceneKey);
    const position = this.clipScenes.indexOf(sceneKey) + 1;
    if (this.scenario === "three-hearts" && position === 6) return "provider_timeout";
    if (this.scenario === "refusal" && position === 3) return "content_refused";
    return null;
  }

  private produce<F extends StageFlow>(flow: F, input: StageInput[F], mock: MockRun): StageOutput[F] {
    switch (flow) {
      case "studio-script":
        return scriptOutput(input as ScriptIn, this.scenario) as StageOutput[F];
      case "studio-narrate": {
        const n = input as NarrateIn;
        const words = n.phrases.join(" ").split(/\s+/).length;
        const duration = round1(Math.max(1, words / 2.6));
        const per = duration / n.phrases.length;
        const asset = this.addAsset(mock, `narration-${n.scene_key}.wav`, "audio/wav");
        return {
          asset_id: asset,
          duration_s: duration,
          reused: false,
          phrases: n.phrases.map((text, i) => ({ text, start_s: round1(i * per), end_s: round1((i + 1) * per) })),
        } as StageOutput[F];
      }
      case "studio-clip": {
        const c = input as ClipIn;
        const asset = this.addAsset(mock, `clip-${c.scene_key}-take${c.take}.mp4`, "video/mp4");
        return { asset_id: asset, duration_s: c.seconds, reused: false } as StageOutput[F];
      }
      case "studio-render": {
        const r = input as RenderIn;
        const asset = this.addAsset(mock, `short-${r.mode}.mp4`, "video/mp4");
        const duration = typeof r.timeline.duration_s === "number" ? r.timeline.duration_s : 45;
        return { asset_id: asset, digest: sha256(JSON.stringify(r.timeline)), duration_s: duration } as StageOutput[F];
      }
      case "stick-script":
        return stickScriptOutput(input as StickScriptIn) as StickScriptOut as StageOutput[F];
      case "stick-produce": {
        const p = input as StickProduceIn;
        const files = stickProduceFiles(p) as StickRenderFiles;
        const title = String((p.skit.meta as { title?: string } | undefined)?.title ?? "skit");
        const text = (t: string) => new TextEncoder().encode(t);
        return {
          mp4_asset_id: this.addAsset(mock, `${title}.mp4`, "video/mp4", files.mp4),
          srt_asset_id: this.addAsset(mock, `${title}.srt`, "application/x-subrip", text(files.srt)),
          txt_asset_id: this.addAsset(mock, `${title}.txt`, "text/plain", text(files.txt)),
          manifest_asset_id: this.addAsset(mock, `${title}.manifest.json`, "application/json", text(files.manifest)),
          duration_s: files.durationS,
          // The real digest is the MP4's SHA-256; the mock's MP4 is canned, so it digests the input.
          digest: sha256(`stick-produce:${canonicalJson(p)}`),
          reminder: files.reminder,
        } as StageOutput[F];
      }
      case "studio-publish": {
        const p = input as PublishIn;
        if (p.platform === "tiktok") {
          return { url: null, result: "Draft saved in TikTok. Finish privacy in the app. Nothing is public." } as StageOutput[F];
        }
        const host = p.platform === "youtube" ? "https://studio.youtube.com/video/mock" : "https://www.instagram.com/reel/mock";
        const audit = p.platform === "youtube" && p.privacy === "public" ? " Uploaded private until Google’s audit; flip it public in YouTube." : "";
        return { url: host, result: `Posted to ${p.platform}.${audit}` } as StageOutput[F];
      }
      case "studio-topics": {
        const t = input as TopicsIn;
        const topics = topicsFromArticle(t.text, t.heading);
        const list = topics.length > 0 ? topics : [{ title: (t.heading || "From the link").slice(0, 80), line: t.text.slice(0, 160) || t.url }];
        return { topics: list.slice(0, 5) } as StageOutput[F];
      }
      case "studio-hooks": {
        const h = input as HooksIn;
        const short = h.line.replace(/[.!?]$/, "");
        const lower = short.charAt(0).toLowerCase() + short.slice(1);
        const clipped = short.split(/\s+/).slice(0, 6).join(" ");
        return { hooks: [`Wait — ${lower}.`, `${h.topic.trim()}: ${short}.`, `${clipped}.`] } as StageOutput[F];
      }
      case "studio-titles": {
        const t = input as TitlesIn;
        const fromLine = (t.lines[0] ?? t.title).slice(0, 70);
        return {
          pairs: [
            { title: t.title, cover: "opening" },
            { title: t.title.endsWith("?") ? t.title : `${t.title}?`, cover: "slam" },
            { title: fromLine, cover: "end" },
          ],
        } as StageOutput[F];
      }
      case "studio-translate": {
        const t = input as TranslateIn;
        return {
          language: t.language,
          title: t.title,
          lines: t.lines,
          slams: t.slams,
          hashtags: t.hashtags,
          warning: "Mock translation: the lines are unchanged until a live writer is connected. Review them before voicing.",
        } as StageOutput[F];
      }
    }
    throw new Error(`unknown flow ${String(flow)}`);
  }

  private reusedOutput<F extends StageFlow>(flow: F, fromRunId: string): StageOutput[F] {
    const json = (this.mustGet(fromRunId).output!.ports[STAGE_OUTPUT_PORT][0] as { json: Record<string, unknown> }).json;
    return ("reused" in json ? { ...json, reused: true } : { ...json }) as StageOutput[F];
  }

  /** Placeholder bytes (until the F3 media script generates real clips) unless `content` is given. */
  private addAsset(mock: MockRun, name: string, mimeType: string, content?: Uint8Array): string {
    const id = randomUUID();
    const bytes = content ?? new TextEncoder().encode(`tamshoot mock asset ${id} ${name}`);
    this.assets.set(id, {
      meta: { id, name, mime_type: mimeType, size_bytes: bytes.byteLength, created_at: this.iso() },
      bytes,
    });
    mock.assetIds.push(id);
    return id;
  }

  // ── plumbing ────────────────────────────────────────────────────────────
  private at(mock: MockRun, ms: number, fn: () => void): void {
    mock.timers.push(setTimeout(fn, Math.max(0, Math.round(ms * this.timeScale))));
  }

  private emit(mock: MockRun, event: string, payload: Record<string, unknown>, stepId: string | null = null): void {
    mock.events.push({
      seq: mock.events.length + 1,
      event,
      payload,
      step_id: stepId,
      iteration: null,
      member: null,
      created_at: this.iso(),
    });
    const waiters = mock.waiters;
    mock.waiters = [];
    waiters.forEach((w) => w());
  }

  private mustGet(runId: string): MockRun {
    const mock = this.runs.get(runId);
    if (!mock) throw new TamtreeError("Run not found.", 404, "not_found");
    return mock;
  }

  private iso(): string {
    return this.now().toISOString();
  }
}

function isTerminal(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function scriptOutput(input: ScriptIn, scenario: MockScenario): StageOutput["studio-script"] {
  switch (input.mode) {
    case "draft": {
      if (scenario === "three-hearts" || /octopus/i.test(input.brief.topic)) return { beats: THREE_HEARTS_BEATS };
      const count = Math.round(input.brief.length_s / 7.5);
      const beats: Beat[] = Array.from({ length: count }, (_, i) => ({
        narration: `Beat ${i + 1} about ${input.brief.topic}.`,
        visual_prompt: `A ${input.brief.look} shot for beat ${i + 1}.`,
      }));
      return { beats };
    }
    case "revise": {
      // The mock "applies" the note to the first beat only, and says so.
      const beats = input.beats.map((b, i) => (i === 0 ? { ...b, narration: tighten(b.narration) } : b));
      return { beats, changed: beats.map((_, i) => i === 0) };
    }
    case "revise-scene": {
      const visual = /dark|light|slow|fast|close|wide|shot|colou?r|bright/i.test(input.note);
      const beat = visual
        ? { ...input.beat, visual_prompt: `${input.beat.visual_prompt} (${input.note.trim()})` }
        : { ...input.beat, narration: tighten(input.beat.narration) };
      return { beat, changed: { narration: !visual, visual_prompt: visual } };
    }
  }
}

function tighten(text: string): string {
  const first = text.split(/[,.;]/)[0].trim();
  return first.endsWith(".") ? first : `${first}.`;
}

function inputDigest(flow: StageFlow, input: unknown): string {
  return sha256(`${flow}:${canonicalJson(input)}`).slice(0, 24);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
