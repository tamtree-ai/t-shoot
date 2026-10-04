/**
 * The pg-boss queue shared by the Next server (which only enqueues) and the worker
 * (which drives runs). The worker is a separate Node process; nothing here runs a job.
 */
import "server-only";

import { PgBoss } from "pg-boss";

export const DRIVE_RUN_QUEUE = "run.drive";
export const CANCEL_RUN_QUEUE = "run.cancel";
export const STUDIO_PROCESS_QUEUE = "studio.process";
export const STUDIO_NOTIFY_QUEUE = "studio.notify";

const g = globalThis as unknown as { __tamshootBoss?: Promise<PgBoss> };

export function getBoss(): Promise<PgBoss> {
  g.__tamshootBoss ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (see .env.example).");
    const boss = new PgBoss(url);
    boss.on("error", (e) => console.error("[pg-boss]", e));
    await boss.start();
    await boss.createQueue(DRIVE_RUN_QUEUE);
    await boss.createQueue(CANCEL_RUN_QUEUE);
    await boss.createQueue(STUDIO_PROCESS_QUEUE);
    await boss.createQueue(STUDIO_NOTIFY_QUEUE);
    return boss;
  })();
  return g.__tamshootBoss;
}

/** One job per run row; the singleton key stops a double-click from queuing it twice. */
export async function enqueueDrive(runId: string): Promise<void> {
  const boss = await getBoss();
  await boss.send(DRIVE_RUN_QUEUE, { runId }, { singletonKey: runId, retryLimit: 5, retryDelay: 5, retryBackoff: true });
}

/** Cancel goes through the worker: it owns the adapter (and, on the mock, the runs). */
export async function enqueueCancel(runId: string): Promise<void> {
  const boss = await getBoss();
  await boss.send(CANCEL_RUN_QUEUE, { runId }, { singletonKey: `cancel:${runId}` });
}

/** Makes the previews of one uploaded Studio Review file. Retried a few times; a file that still fails is marked failed by the worker. */
export async function enqueueStudioProcess(fileId: string): Promise<void> {
  const boss = await getBoss();
  await boss.send(STUDIO_PROCESS_QUEUE, { fileId }, { singletonKey: fileId, retryLimit: 2, retryDelay: 10 });
}

/** Mails what has happened on one share right away (a decision), or, with no share, sweeps every share for digests that are due. */
export async function enqueueStudioNotify(shareId: string | null): Promise<void> {
  const boss = await getBoss();
  await boss.send(STUDIO_NOTIFY_QUEUE, { shareId }, { singletonKey: shareId ?? "sweep", singletonSeconds: 5, retryLimit: 2, retryDelay: 30 });
}
