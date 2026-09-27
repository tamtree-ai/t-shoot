/**
 * Track W1: the adapter against a real Tamtree `/v1` (07-frontend-first §1).
 *
 * Plain `fetch`, typed from the vendored `v1.d.ts`. Where `/v1` and the adapter contract
 * differ, this file absorbs it so nothing behind the seam changes:
 *
 * - **Flows are addressed by name.** `/v1/flows/{id}/run` takes an id. Provisioning prints
 *   the name → id map for `TAMTREE_FLOW_IDS`, so the runtime key needs no `write:flows`;
 *   without it the map is read from `GET /v1/flows` (which does need `write:flows`).
 * - **Events page.** `/v1/runs/{id}/events` answers `{items, next_cursor}`, where the cursor
 *   is the last seq; it is mapped back to `next_after_seq`.
 * - **The stream polls A3.** The SSE stream resumes by stream position, not by `seq`, so
 *   following a run polls `…/events?after_seq=` until the run is terminal. Exact, restart-
 *   safe, and a second of latency is nothing to a t-shoot screen.
 * - **Byte ranges.** D1's content route ignores `Range` and may 302 to a presigned URL.
 *   Assets are immutable by id, so each is fetched whole once, cached (bounded), and
 *   sliced here. Track W3's media proxy replaces this.
 */
import "server-only";

import { TamtreeError, type TamtreeAdapter, type TriggerOptions } from "./adapter";
import type { StageFlow, StageInput } from "./stage-flows";
import {
  isTerminal,
  type AssetContent,
  type AssetOut,
  type MessageAccepted,
  type RunDetail,
  type RunEventOut,
  type RunEventPage,
  type RunOut,
  type RunOutputOut,
  type UsageSummaryOut,
} from "./types";
import type { components } from "./v1";

type Schemas = components["schemas"];

const POLL_MS = 1_000;
const CACHE_BYTES = 256 * 1024 * 1024;

export type LiveOptions = {
  baseUrl: string;
  apiKey: string;
  /** For tests: a stand-in fetch. */
  fetch?: typeof fetch;
  pollMs?: number;
  /** name → flow id, from provisioning. */
  flowIds?: Record<string, string>;
};

export class LiveTamtreeAdapter implements TamtreeAdapter {
  readonly kind = "live" as const;

  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pollMs: number;
  private flowIds: Map<string, string> | null = null;
  private readonly cache = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  private cachedBytes = 0;

  constructor(private readonly opts: LiveOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
    this.pollMs = opts.pollMs ?? POLL_MS;
    if (opts.flowIds) this.flowIds = new Map(Object.entries(opts.flowIds));
  }

  // ── runs ────────────────────────────────────────────────────────────────
  async triggerRun<F extends StageFlow>(flow: F, input: StageInput[F], opts: TriggerOptions): Promise<RunDetail> {
    const flowId = await this.flowId(flow);
    const body: Schemas["RunFlowIn"] = { input: input as Record<string, unknown>, metadata: opts.metadata ?? null };
    const detail = await this.json<RunDetail>(`/v1/flows/${flowId}/run`, {
      method: "POST",
      headers: { "Idempotency-Key": opts.idempotencyKey },
      body: JSON.stringify(body),
    });
    return { ...detail, run: normalizeRun(detail.run) };
  }

  async getRun(runId: string): Promise<RunOut> {
    return normalizeRun(await this.json<RunOut>(`/v1/runs/${enc(runId)}`));
  }

  getRunOutput(runId: string): Promise<RunOutputOut> {
    return this.json(`/v1/runs/${enc(runId)}/output`);
  }

  async listRunEvents(runId: string, opts: { afterSeq?: number; limit?: number } = {}): Promise<RunEventPage> {
    const q = new URLSearchParams({ after_seq: String(opts.afterSeq ?? 0) });
    if (opts.limit) q.set("limit", String(opts.limit));
    const page = await this.json<Schemas["RunEventV1Page"]>(`/v1/runs/${enc(runId)}/events?${q}`);
    return { items: page.items, next_after_seq: page.next_cursor == null ? null : Number(page.next_cursor) };
  }

  async *streamRunEvents(runId: string, opts: { afterSeq?: number; signal?: AbortSignal } = {}): AsyncIterable<RunEventOut> {
    let seq = opts.afterSeq ?? 0;
    for (;;) {
      if (opts.signal?.aborted) return;
      // Read status first: events written before a terminal status are then all listed.
      const terminal = isTerminal((await this.getRun(runId)).status);
      for (;;) {
        const page = await this.listRunEvents(runId, { afterSeq: seq, limit: 500 });
        for (const e of page.items) {
          seq = e.seq;
          yield e;
        }
        if (page.next_after_seq == null) break;
      }
      if (terminal) return;
      await sleep(this.pollMs, opts.signal);
    }
  }

  cancelRun(runId: string): Promise<MessageAccepted> {
    return this.json(`/v1/runs/${enc(runId)}/cancel`, { method: "POST" });
  }

  getUsageSummary(): Promise<UsageSummaryOut> {
    return this.json("/v1/usage/summary");
  }

  // ── assets (D1) ─────────────────────────────────────────────────────────
  async listRunAssets(runId: string): Promise<AssetOut[]> {
    const out: AssetOut[] = [];
    let cursor: string | null = null;
    do {
      const q = new URLSearchParams({ limit: "100" });
      if (cursor) q.set("cursor", cursor);
      const page: Schemas["RunAssetPage"] = await this.json(`/v1/runs/${enc(runId)}/assets?${q}`);
      out.push(...page.items.map(({ id, name, mime_type, size_bytes, created_at }) => ({ id, name, mime_type, size_bytes, created_at })));
      cursor = page.next_cursor;
    } while (cursor);
    return out;
  }

  async getAssetContent(assetId: string, range?: { start: number; end?: number }): Promise<AssetContent> {
    const asset = await this.assetBytes(assetId);
    const size = asset.bytes.byteLength;
    const start = Math.min(range?.start ?? 0, size);
    const end = Math.min(range?.end ?? size - 1, size - 1);
    const bytes = range ? asset.bytes.subarray(start, end + 1) : asset.bytes;
    return {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      mimeType: asset.mimeType,
      size,
      range: range ? { start, end } : null,
    };
  }

  private async assetBytes(assetId: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const hit = this.cache.get(assetId);
    if (hit) {
      this.cache.delete(assetId); // re-insert: most recently used last
      this.cache.set(assetId, hit);
      return hit;
    }
    const res = await this.request(`/v1/assets/${enc(assetId)}/content`);
    const entry = { bytes: new Uint8Array(await res.arrayBuffer()), mimeType: res.headers.get("content-type") ?? "application/octet-stream" };
    this.cache.set(assetId, entry);
    this.cachedBytes += entry.bytes.byteLength;
    for (const [id, e] of this.cache) {
      if (this.cachedBytes <= CACHE_BYTES || id === assetId) break;
      this.cache.delete(id);
      this.cachedBytes -= e.bytes.byteLength;
    }
    return entry;
  }

  // ── flows ───────────────────────────────────────────────────────────────
  private async flowId(name: string): Promise<string> {
    let id = this.flowIds?.get(name);
    if (!id) {
      this.flowIds = await this.readFlowIds();
      id = this.flowIds.get(name);
    }
    if (!id) throw new TamtreeError(`Tamtree has no flow named "${name}". Run \`pnpm tamtree:provision\`.`, 404, "flow_not_provisioned");
    return id;
  }

  /** name → id for every flow in the workspace. */
  async readFlowIds(): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    let cursor: string | null = null;
    do {
      const q = new URLSearchParams({ limit: "100" });
      if (cursor) q.set("cursor", cursor);
      const page: Schemas["FlowPage"] = await this.json(`/v1/flows?${q}`);
      for (const f of page.items) ids.set(f.name, f.id);
      cursor = page.next_cursor;
    } while (cursor);
    return ids;
  }

  // ── transport ───────────────────────────────────────────────────────────
  async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.request(path, init);
    return (await res.json()) as T;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.opts.apiKey}`);
    if (init.body) headers.set("Content-Type", "application/json");
    // A presigned 302 goes to another origin; fetch drops Authorization across origins.
    const res = await this.fetchImpl(`${this.base}${path}`, { ...init, headers, redirect: "follow" });
    if (res.ok) return res;
    let code = "http_error";
    let message = `Tamtree answered ${res.status} for ${init.method ?? "GET"} ${path}.`;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string; detail?: unknown } };
      if (body.error?.code) code = body.error.code;
      if (body.error?.message) message = body.error.message;
      // A 422 carries its issue list in `detail`; without it the message says nothing actionable.
      if (Array.isArray(body.error?.detail) && body.error.detail.length) message += `: ${body.error.detail.join("; ")}`;
    } catch {
      // not JSON: keep the generic message
    }
    throw new TamtreeError(message, res.status, code);
  }
}

const enc = encodeURIComponent;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

/**
 * Tamtree ends a successful run as `succeeded`; t-shoot's run rows, worker and UI all
 * say `completed` (the mock's word). Translate here so nothing past the adapter polls a
 * finished run forever.
 */
function normalizeRun<R extends { status: string }>(run: R): R {
  return run.status === "succeeded" ? { ...run, status: "completed" } : run;
}
