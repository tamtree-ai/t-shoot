/**
 * The one seam between t-shoot and Tamtree (07-frontend-first §1).
 *
 * Only services and the worker call this. The UI never imports it. Track F runs on
 * MockTamtreeAdapter; Track W adds LiveTamtreeAdapter, which must pass the same
 * contract suite (tests/contract/adapter.contract.ts).
 *
 * Method → live call:
 *   triggerRun      POST /v1/flows/{flow_id}/run            (Idempotency-Key header)
 *   getRun          GET  /v1/runs/{run_id}                   A1
 *   getRunOutput    GET  /v1/runs/{run_id}/output            A2
 *   streamRunEvents GET  /v1/runs/{run_id}/stream  (SSE)
 *   listRunEvents   GET  /v1/runs/{run_id}/events            A3 (catch-up)
 *   cancelRun       POST /v1/runs/{run_id}/cancel            A4
 *   getUsageSummary GET  /v1/usage/summary                   A5
 *   listRunAssets   GET  /v1/runs/{run_id}/assets            D1 (provisional)
 *   getAssetContent GET  /v1/assets/{asset_id}/content       D1 (provisional)
 */
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
} from "./types";
import type { StageFlow, StageInput } from "./stage-flows";

export type TriggerOptions = {
  /** Required: every trigger is idempotent (02-architecture §4, run engine). */
  idempotencyKey: string;
  metadata?: Record<string, string>;
};

export interface TamtreeAdapter {
  readonly kind: "mock" | "live";

  triggerRun<F extends StageFlow>(flow: F, input: StageInput[F], opts: TriggerOptions): Promise<RunDetail>;
  getRun(runId: string): Promise<RunOut>;
  getRunOutput(runId: string): Promise<RunOutputOut>;

  /** Live events until the run is terminal. Starts after `afterSeq` when given. */
  streamRunEvents(runId: string, opts?: { afterSeq?: number; signal?: AbortSignal }): AsyncIterable<RunEventOut>;
  /** Persisted events, for catch-up after a restart. */
  listRunEvents(runId: string, opts?: { afterSeq?: number; limit?: number }): Promise<RunEventPage>;

  cancelRun(runId: string): Promise<MessageAccepted>;
  getUsageSummary(): Promise<UsageSummaryOut>;

  listRunAssets(runId: string): Promise<AssetOut[]>;
  getAssetContent(assetId: string, range?: { start: number; end?: number }): Promise<AssetContent>;
}

export class TamtreeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "TamtreeError";
  }
}
