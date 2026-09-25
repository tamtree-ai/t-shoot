/**
 * The pg-boss queue shared by the Next server (which only enqueues) and the worker
 * (which drives runs). The worker is a separate Node process; nothing here runs a job.
 */
import "server-only";

import { PgBoss } from "pg-boss";

export const DRIVE_RUN_QUEUE = "run.drive";

const g = globalThis as unknown as { __tamshootBoss?: Promise<PgBoss> };

export function getBoss(): Promise<PgBoss> {
  g.__tamshootBoss ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (see .env.example).");
    const boss = new PgBoss(url);
    boss.on("error", (e) => console.error("[pg-boss]", e));
    await boss.start();
    await boss.createQueue(DRIVE_RUN_QUEUE);
    return boss;
  })();
  return g.__tamshootBoss;
}

/** One job per run row; the singleton key stops a double-click from queuing it twice. */
export async function enqueueDrive(runId: string): Promise<void> {
  const boss = await getBoss();
  await boss.send(DRIVE_RUN_QUEUE, { runId }, { singletonKey: runId, retryLimit: 5, retryDelay: 5, retryBackoff: true });
}
