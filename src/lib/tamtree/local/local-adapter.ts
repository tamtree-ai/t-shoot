/**
 * LocalStickAdapter — t-shoot without Tamtree (`TAMTREE_ADAPTER=local`, standalone plan §2).
 *
 * Runs `stick-script` and `stick-produce` in this process against the StickStage render
 * service, with Kokoro for voices and the user's own model (if any) for writing and the text
 * helpers. Runs, events
 * and assets live on disk (`LocalRunStore`), so the Next server and the worker share them and
 * `getRun` / `listRunEvents` / `getAssetContent` keep their /v1 meaning. Nothing is paid for:
 * every run's cost is 0. Flows that need Tamtree fail at once with `not_available`.
 */
import fs from "node:fs";

import { TamtreeError, type TamtreeAdapter, type TriggerOptions } from "../adapter";
import { STAGE_OUTPUT_PORT, type StageFlow, type StageInput, type StickProduceIn, type StickScriptIn } from "../stage-flows";
import { isTerminal, type AssetContent, type AssetOut, type MessageAccepted, type RunDetail, type RunEventOut, type RunEventPage, type RunOut, type RunOutputOut, type UsageSummaryOut } from "../types";
import { FlowError, stickProduce, stickScript, type FlowContext } from "./flows";
import { LocalRunStore } from "./run-store";
import { TEXT_FLOW_IDS, textFlow, type TextFlow } from "./text-flows";
import type { StickStageClient } from "./stickstage";
import type { Tts } from "./tts";
import type { Writer } from "./writer";

/** The flows standalone mode runs (the text helpers only with a writer model). The rest need Tamtree. */
export const LOCAL_FLOWS = ["stick-script", "stick-produce", ...TEXT_FLOW_IDS] as const satisfies readonly StageFlow[];

export type LocalOptions = {
  dir: string;
  stickstage: StickStageClient;
  tts: Tts;
  writer?: Writer;
  /** How often a reader in another process looks for new events. */
  pollMs?: number;
};

export class LocalStickAdapter implements TamtreeAdapter {
  readonly kind = "local" as const;
  readonly store: LocalRunStore;
  private readonly running = new Map<string, AbortController>();
  private readonly pollMs: number;

  constructor(private readonly opts: LocalOptions) {
    this.store = new LocalRunStore(opts.dir);
    this.pollMs = opts.pollMs ?? 250;
  }

  get hasWriter(): boolean {
    return !!this.opts.writer;
  }

  async triggerRun<F extends StageFlow>(flow: F, input: StageInput[F], opts: TriggerOptions): Promise<RunDetail> {
    const existing = this.store.byKey(opts.idempotencyKey);
    if (existing) return { run: this.store.get(existing), steps: [] };
    const run = this.store.create(flow, input, opts.idempotencyKey, opts.metadata);
    if (run.status !== "queued" || this.running.has(run.id)) return { run, steps: [] };
    const controller = new AbortController();
    this.running.set(run.id, controller);
    // Start after the trigger has answered, as a queued run does in Tamtree.
    setTimeout(() => void this.execute(run.id, flow, input, controller), 0);
    return { run, steps: [] };
  }

  private async execute<F extends StageFlow>(id: string, flow: F, input: StageInput[F], controller: AbortController): Promise<void> {
    const live = () => !isTerminal(this.store.get(id).status) && !controller.signal.aborted;
    const watch = setInterval(() => {
      if (this.store.cancelRequested(id)) controller.abort(new FlowError("cancelled", "Cancelled."));
    }, this.pollMs);
    try {
      if (!live() || this.store.cancelRequested(id)) return;
      this.store.patch(id, { status: "running", started_at: new Date().toISOString() });
      const ctx: FlowContext = {
        stickstage: this.opts.stickstage,
        tts: this.opts.tts,
        writer: this.opts.writer,
        signal: controller.signal,
        step: async (stepId, fn) => {
          if (!live()) throw controller.signal.reason ?? new FlowError("cancelled", "Cancelled.");
          this.store.emit(id, "step_start", { step_id: stepId }, stepId);
          const out = await fn();
          if (live()) this.store.emit(id, "step_complete", { step_id: stepId }, stepId);
          return out;
        },
        addAsset: (name, mime, bytes) => this.store.addAsset(id, name, mime, bytes),
      };
      let result: unknown;
      if (flow === "stick-script") result = await stickScript(input as StickScriptIn, ctx);
      else if (flow === "stick-produce") result = await stickProduce(input as StickProduceIn, ctx);
      else if ((TEXT_FLOW_IDS as readonly string[]).includes(flow)) result = await textFlow(flow as TextFlow, input, ctx);
      else throw new FlowError("not_available", `${flow} needs Tamtree. Standalone mode writes and makes stick skits only.`);
      if (!live()) return;
      this.store.emit(id, "usage", { cost_usd: "0", tokens_in: 0, tokens_out: 0 });
      this.store.setOutput(id, { output_ref: `out_${id}`, ports: { [STAGE_OUTPUT_PORT]: [{ json: result as Record<string, unknown> }] } });
      this.store.finish(id, "completed", null);
    } catch (e) {
      if (controller.signal.aborted || (e instanceof FlowError && e.code === "cancelled")) this.store.finish(id, "cancelled", { code: "cancelled", message: "Cancelled." });
      else if (e instanceof FlowError) this.store.finish(id, "failed", { code: e.code, message: e.message });
      else this.store.finish(id, "failed", { code: "internal_error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      clearInterval(watch);
      this.running.delete(id);
    }
  }

  async getRun(runId: string): Promise<RunOut> {
    return this.store.get(runId);
  }

  async getRunOutput(runId: string): Promise<RunOutputOut> {
    return this.store.output(runId);
  }

  async *streamRunEvents(runId: string, opts: { afterSeq?: number; signal?: AbortSignal } = {}): AsyncIterable<RunEventOut> {
    let after = opts.afterSeq ?? 0;
    while (!opts.signal?.aborted) {
      const page = this.store.events(runId, after, 1000);
      for (const e of page.items) {
        yield e;
        after = e.seq;
      }
      if (page.next_after_seq != null) continue;
      // Terminal and drained: the terminal event is always written last.
      if (isTerminal(this.store.get(runId).status) && this.store.events(runId, after, 1).items.length === 0) return;
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, this.pollMs);
        opts.signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
      });
    }
  }

  async listRunEvents(runId: string, opts: { afterSeq?: number; limit?: number } = {}): Promise<RunEventPage> {
    return this.store.events(runId, opts.afterSeq ?? 0, opts.limit ?? 100);
  }

  async cancelRun(runId: string): Promise<MessageAccepted> {
    const run = this.store.get(runId);
    if (isTerminal(run.status)) throw new TamtreeError("Run is already finished.", 409, "conflict");
    this.store.requestCancel(runId);
    const here = this.running.get(runId);
    if (here) {
      here.abort(new FlowError("cancelled", "Cancelled."));
      this.store.finish(runId, "cancelled", { code: "cancelled", message: "Cancelled." });
    }
    return { run_id: runId };
  }

  async getUsageSummary(): Promise<UsageSummaryOut> {
    const d = new Date();
    return {
      month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      cost_usd: "0",
      cost_exact: "0",
      cost_estimated: "0",
      tokens_in: 0,
      tokens_out: 0,
      unpriced_calls: 0,
      storage_bytes: 0,
      budget: null,
    };
  }

  async listRunAssets(runId: string): Promise<AssetOut[]> {
    return this.store.listAssets(runId);
  }

  async getAssetContent(assetId: string, range?: { start: number; end?: number }): Promise<AssetContent> {
    const { meta, file } = this.store.asset(assetId);
    const size = meta.size_bytes;
    const start = range?.start ?? 0;
    const end = Math.min(range?.end ?? size - 1, size - 1);
    const stream = size === 0 ? null : fs.createReadStream(file, { start, end });
    return {
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          if (!stream) return controller.close();
          stream.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
          stream.on("end", () => controller.close());
          stream.on("error", (e) => controller.error(e));
        },
        cancel() {
          stream?.destroy();
        },
      }),
      mimeType: meta.mime_type,
      size,
      range: range ? { start, end } : null,
    };
  }
}
