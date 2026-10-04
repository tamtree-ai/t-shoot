/**
 * The t-shoot worker: a separate Node process (not part of Next) that drives runs.
 *
 *   pnpm worker
 *
 * On start it re-enqueues every run that has not finished — that, plus `driveRun`'s
 * resume-from-last-event, is the "kill the worker mid-run → it recovers" path. While the
 * adapter is the in-memory mock, the mock lives in *this* process, so killing the worker
 * also loses the mock's runs (they come back as "run_lost"); against live Tamtree the
 * run survives. The adapter suite in tests/worker covers the live-shaped case.
 */
import { eq, notInArray } from "drizzle-orm";

import { db, schema } from "@/db";
import { CANCEL_RUN_QUEUE, DRIVE_RUN_QUEUE, enqueueDrive, enqueueStudioProcess, getBoss, STUDIO_NOTIFY_QUEUE, STUDIO_PROCESS_QUEUE } from "@/lib/queue";
import { draftAheadTick } from "@/services/show-ideas";
import { pollPostStats } from "@/services/results";
import { assertAuthMode } from "@/lib/standalone";
import { assertStudioEnv } from "@/lib/studio/env";
import { getTamtreeAdapter } from "@/lib/tamtree";
import { sendDecisionMails, sweep } from "@/services/studio/notify";
import { applyRunResult } from "@/services/apply-result";
import { driveRun } from "./drive-run";
import { dbRunStore } from "./db-run-store";
import { checkFfmpeg, failStudioFile, processStudioFile } from "./studio-process";

async function main() {
  assertAuthMode();
  assertStudioEnv();
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

  // One at a time: ffmpeg already uses every core.
  await boss.work<{ fileId: string }, void, { localConcurrency: 1; includeMetadata: true }>(STUDIO_PROCESS_QUEUE, { localConcurrency: 1, includeMetadata: true }, async ([job]) => {
    try {
      await processStudioFile(job.data.fileId);
    } catch (e) {
      // pg-boss counts retries from 0; the last one gives up.
      if (job.retryCount >= job.retryLimit) await failStudioFile(job.data.fileId);
      throw e;
    }
  });
  // Studio Review mail: a decision goes out at once, comments and uploads in digests, swept every minute.
  await boss.work<{ shareId: string | null }>(STUDIO_NOTIFY_QUEUE, async ([job]) => {
    const sent = job.data.shareId ? await sendDecisionMails({ shareId: job.data.shareId }) : await sweep();
    if (sent > 0) console.log(`[worker] studio mail: ${sent} sent`);
  });
  await boss.schedule(STUDIO_NOTIFY_QUEUE, "* * * * *", { shareId: null });
  const noFfmpeg = await checkFfmpeg();
  if (noFfmpeg) console.error(`[worker] WARNING: ${noFfmpeg} Images still work.`);

  await boss.createQueue("show.horizon");
  await boss.schedule("show.horizon", "0 * * * *");
  await boss.work("show.horizon", async () => {
    const drafted = await draftAheadTick();
    const stats = await pollPostStats();
    console.log(`[worker] horizon drafted ${drafted}, stats ${stats}`);
  });

  const unfinished = await db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(notInArray(schema.runs.status, ["completed", "failed", "cancelled"]));
  for (const { id } of unfinished) await enqueueDrive(id);
  const pendingFiles = await db.select({ id: schema.studioFiles.id }).from(schema.studioFiles).where(eq(schema.studioFiles.processing, "pending"));
  for (const { id } of pendingFiles) await enqueueStudioProcess(id);
  console.log(`[worker] up (${adapter.kind} adapter); resumed ${unfinished.length} unfinished run(s), ${pendingFiles.length} file(s) to process`);

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
