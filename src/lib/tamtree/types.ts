/**
 * Tamtree /v1 shapes t-shoot depends on, re-exported from the vendored generated
 * client so the rest of the app never reaches into `v1.d.ts` directly.
 *
 * Names follow engine-api *as built* (changes/2026-09-15-engine-api/02-api-contract.md):
 * events carry `created_at` (not `ts`), cancel answers `{run_id}`, `total_cost_usd` is a
 * number on RunOut but a decimal string on the usage summary.
 */
import type { components } from "./v1";

type Schemas = components["schemas"];

export type RunOut = Schemas["RunOut"];
export type RunDetail = Schemas["RunDetail"];
export type RunFlowIn = Schemas["RunFlowIn"];
export type RunOutputOut = Schemas["RunOutputOut"];
export type RunEventOut = Schemas["RunEventOut"];
export type RunEventPage = Schemas["RunEventPage"];
export type UsageSummaryOut = Schemas["UsageSummaryOut"];
export type MessageAccepted = Schemas["MessageAccepted"];

/**
 * Run statuses t-shoot maps. `RunOut.status` is a free string on /v1, so anything
 * else is treated as "working" and never as done (03-experience §3).
 */
export const TERMINAL_STATUSES = ["completed", "failed", "cancelled"] as const;
export type KnownRunStatus = "queued" | "running" | (typeof TERMINAL_STATUSES)[number];

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * Engine-api D1 — NOT BUILT as of 9aaaa09f. Hand-written from 02-api-contract.md
 * (`GET /v1/runs/{id}/assets`, `GET /v1/assets/{id}/content`, scope `read:assets`).
 * PROVISIONAL: replace with the generated types at Track W1.
 */
export type AssetOut = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export type AssetContent = {
  body: ReadableStream<Uint8Array>;
  mimeType: string;
  /** Total size of the asset, when known. */
  size: number | null;
  /** Present when a byte range was requested and honoured (206). */
  range: { start: number; end: number } | null;
};
