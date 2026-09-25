/**
 * The Tamshoot worker: a separate Node process (not part of Next) that drives runs.
 *
 *   pnpm worker
 *
 * On start it re-enqueues every run that has not finished — that, plus `driveRun`'s
 * resume-from-last-event, is the "kill the worker mid-run → it recovers" path. While the
 * adapter is the in-memory mock, the mock lives in *this* process, so killing the worker
 * also loses the mock's runs (they come back as "run_lost"); against live Tamtree the
 * run survives. The adapter suite in tests/worker covers the live-shaped case.
 */
import { notInArray } from "drizzle-orm";

import { db, schema } from "@/db";
import { CANCEL_RUN_QUEUE, DRIVE_RUN_QUEUE, enqueueDrive, getBoss } from "@/lib/queue";
import { getTamtreeAdapter } from "@/lib/tamtree";
import { applyRunResult } from "@/services/apply-result";
import { driveRun } from "./drive-run";
import { dbRunStore } from "./db-run-store";

async function main() {
  const boss = await getBoss();
  const adapter = getTamtreeAdapter();

  await boss.work<{ runId: string }>(DRIVE_RUN_QUEUE, { localConcurrency: 8 }, async ([job]) => {
    await driveRun(job.data.runId, { store: dbRunStore, adapter, signal: job.signal });
    if (!job.signal.aborted) await applyRunResult(job.data.runId);
  });

  await boss.work<{ runId: string }>(CANCEL_RUN_QUEUE, async ([job]) => {
    const row = await dbRunStore.get(job.data.runId);
    if (!row || ["completed", "failed", "cancelled"].includes(row.status)) return;
    // Not triggered yet: nothing exists in Tamtree to cancel, so just stop the row.
    if (!row.tamtreeRunId) return dbRunStore.patch(row.id, { status: "cancelled" });
    // The driver following the stream sees the terminal event and finalises the row.
    await adapter.cancelRun(row.tamtreeRunId).catch(() => undefined);
  });

  const unfinished = await db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(notInArray(schema.runs.status, ["completed", "failed", "cancelled"]));
  for (const { id } of unfinished) await enqueueDrive(id);
  console.log(`[worker] up (${adapter.kind} adapter); resumed ${unfinished.length} unfinished run(s)`);

  const stop = async () => {
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error("[worker] fatal", e);
  process.exit(1);
});
