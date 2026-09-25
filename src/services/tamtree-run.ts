/**
 * A poll-to-completion helper for stage runs that finish in a couple of seconds
 * (studio-script), triggered directly from a server action rather than the worker.
 *
 * F2 replaces this path for studio-narrate/studio-clip/studio-render: those are long
 * enough, and need live progress, that they belong on the pg-boss dispatcher and SSE
 * consumer instead (07 §4). Only services call this — never UI code (CLAUDE.md).
 */
import "server-only";

import { randomUUID } from "node:crypto";

import { getTamtreeAdapter } from "@/lib/tamtree";
import { readStageOutput } from "@/lib/tamtree/read-output";
import type { StageFlow, StageInput, StageOutput } from "@/lib/tamtree/stage-flows";
import { isTerminal } from "@/lib/tamtree/types";

export class TamtreeRunError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "TamtreeRunError";
  }
}

export type StageRunResult<F extends StageFlow> = {
  runId: string;
  idempotencyKey: string;
  output: StageOutput[F];
  costUsd: number;
};

const POLL_MS = 150;
const TIMEOUT_MS = 30_000;

export async function runStageSync<F extends StageFlow>(
  flow: F,
  input: StageInput[F],
  opts: { idempotencyKey?: string; metadata?: Record<string, string> } = {},
): Promise<StageRunResult<F>> {
  const adapter = getTamtreeAdapter();
  const idempotencyKey = opts.idempotencyKey ?? randomUUID();
  const { run } = await adapter.triggerRun(flow, input, { idempotencyKey, metadata: opts.metadata });

  let current = run;
  const deadline = Date.now() + TIMEOUT_MS;
  while (!isTerminal(current.status)) {
    if (Date.now() > deadline) throw new TamtreeRunError(`${flow} run timed out.`, "timeout");
    await sleep(POLL_MS);
    current = await adapter.getRun(current.id);
  }

  if (current.status !== "completed") {
    const message = typeof current.error?.message === "string" ? current.error.message : `${flow} failed.`;
    const code = typeof current.error?.code === "string" ? current.error.code : "unknown";
    throw new TamtreeRunError(message, code);
  }

  const output = await adapter.getRunOutput(current.id);
  return {
    runId: current.id,
    idempotencyKey,
    output: readStageOutput(flow, output),
    costUsd: Number(current.total_cost_usd),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
