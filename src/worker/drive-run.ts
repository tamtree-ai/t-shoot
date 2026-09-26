/**
 * Drives one Tamshoot `runs` row to a terminal state: trigger it (idempotently), replay
 * missed events through A3, follow the live SSE stream, then read cost, error and output.
 *
 * It is safe to call again after a crash at any point — that is the recovery path
 * ("kill the worker mid-run → it recovers"). The Idempotency-Key is persisted before the
 * trigger, so a retry cannot start a second paid run; `last_event_seq` is persisted after
 * every event, so a retry resumes rather than restarts. Tamtree owns the run, so it
 * outlives the worker.
 *
 * No I/O of its own: a RunStore and a TamtreeAdapter are injected, which is what lets the
 * tests kill and restart a driver against one adapter.
 */
import type { RunRecord } from "@/db/schema";
import { readStageOutput } from "@/lib/tamtree/read-output";
import { TamtreeError, type TamtreeAdapter } from "@/lib/tamtree/adapter";
import type { StageInput } from "@/lib/tamtree/stage-flows";
import { isTerminal, type RunEventOut } from "@/lib/tamtree/types";

export type RunPatch = Partial<
  Pick<
    RunRecord,
    | "tamtreeRunId"
    | "status"
    | "costUsd"
    | "meteredSteps"
    | "unpricedSteps"
    | "error"
    | "lastEventSeq"
    | "output"
  >
>;

export interface RunStore {
  get(id: string): Promise<RunRecord | null>;
  patch(id: string, patch: RunPatch): Promise<void>;
}

const PAGE = 100;

export async function driveRun(
  runId: string,
  deps: { store: RunStore; adapter: TamtreeAdapter; signal?: AbortSignal },
): Promise<void> {
  const { store, adapter, signal } = deps;
  let row = await store.get(runId);
  if (!row || isTerminal(row.status)) return;

  // 1. Trigger. The key was persisted with the row, so replaying it returns the same run.
  if (!row.tamtreeRunId) {
    const { run } = await adapter.triggerRun(row.flow, row.input as StageInput[typeof row.flow], {
      idempotencyKey: row.idempotencyKey,
      metadata: { tamshoot_run_id: row.id, project_id: row.projectId },
    });
    await store.patch(row.id, { tamtreeRunId: run.id, status: run.status });
    row = { ...row, tamtreeRunId: run.id, status: run.status };
  }
  const tamtreeRunId = row.tamtreeRunId!;

  try {
    // 2. Reconcile: events that happened while nobody was listening.
    let seq = row.lastEventSeq;
    for (;;) {
      const page = await adapter.listRunEvents(tamtreeRunId, { afterSeq: seq, limit: PAGE });
      for (const e of page.items) seq = await applyEvent(store, row.id, e);
      if (page.next_after_seq == null) break;
    }

    // 3. Follow live until Tamtree says the run is over.
    const current = await adapter.getRun(tamtreeRunId);
    if (!isTerminal(current.status)) {
      for await (const e of adapter.streamRunEvents(tamtreeRunId, { afterSeq: seq, signal })) {
        seq = await applyEvent(store, row.id, e);
        if (signal?.aborted) return;
      }
    }
    if (signal?.aborted) return;

    // 4. Finalise from the source of truth: RunOut carries cost and error (A1).
    await finalise(row, tamtreeRunId, { store, adapter });
  } catch (err) {
    if (err instanceof TamtreeError && err.status === 404) {
      await store.patch(row.id, {
        status: "failed",
        error: { code: "run_lost", message: "Tamtree no longer knows this run." },
      });
      return;
    }
    throw err;
  }
}

async function applyEvent(store: RunStore, id: string, e: RunEventOut): Promise<number> {
  // step_start means the run is really executing; the terminal status is set by
  // finalise() from RunOut, never inferred from an event name.
  await store.patch(id, { lastEventSeq: e.seq, ...(e.event === "step_start" ? { status: "running" } : {}) });
  return e.seq;
}

async function finalise(
  row: RunRecord,
  tamtreeRunId: string,
  { store, adapter }: { store: RunStore; adapter: TamtreeAdapter },
): Promise<void> {
  const run = await adapter.getRun(tamtreeRunId);
  const base: RunPatch = {
    status: run.status,
    costUsd: Number(run.total_cost_usd).toFixed(6),
    meteredSteps: run.metered_steps,
    unpricedSteps: run.unpriced_steps,
  };
  if (run.status === "completed") {
    const output = readStageOutput(row.flow, await adapter.getRunOutput(tamtreeRunId));
    await store.patch(row.id, { ...base, output: output as Record<string, unknown>, error: null });
  } else if (isTerminal(run.status)) {
    const e = run.error as { code?: unknown; message?: unknown } | null;
    await store.patch(row.id, {
      ...base,
      error: {
        code: typeof e?.code === "string" ? e.code : "unknown",
        message: typeof e?.message === "string" ? e.message : `${row.flow} ${run.status}.`,
      },
    });
  }
}
