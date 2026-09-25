/**
 * The dispatcher's front door (02-architecture §4 run engine). `requestRun` is the only
 * way a stage run starts from Tamshoot: it refuses without a pre-flight estimate and a
 * confirming member, checks the spend guard, persists the row (with its Idempotency-Key)
 * and hands it to the worker. It does not talk to Tamtree — the worker's `driveRun` does.
 */
import "server-only";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { checkSpend, SpendGuardError } from "@/lib/spend-guard";
import type { StageFlow, StageInput } from "@/lib/tamtree/stage-flows";
import { enqueueDrive } from "@/lib/queue";
import { projectSpend } from "./ledger";

export type RequestRunParams<F extends StageFlow> = {
  projectId: string;
  sceneId?: string;
  takeId?: string;
  stage: F;
  input: StageInput[F];
  /** Decimal-string USD the user was shown before confirming. Required. */
  estimateUsd: string | null | undefined;
  /** The member who clicked the confirmation. Required: nothing paid starts unattended. */
  confirmedBy: string | null | undefined;
  /** Supply to make a retry of the *same* action collapse into one run. */
  idempotencyKey?: string;
};

const REFUSALS = {
  no_estimate: "A paid run needs an estimate shown and confirmed first.",
  project_limit: "This would take the video past its limit.",
  workspace_budget: "The workspace budget for this month would be exceeded.",
} as const;

export async function requestRun<F extends StageFlow>(p: RequestRunParams<F>): Promise<{ runId: string }> {
  if (!p.confirmedBy) throw new SpendGuardError("no_estimate", "A paid run needs a confirming member.");

  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, p.projectId));
  if (!project) throw new Error(`Project ${p.projectId} not found.`);

  const { spentUsd, inflightUsd } = await projectSpend(p.projectId);
  const verdict = checkSpend({ estimateUsd: p.estimateUsd, limitUsd: project.limitUsd, spentUsd, inflightUsd });
  if (!verdict.ok) throw new SpendGuardError(verdict.reason, REFUSALS[verdict.reason]);

  const key = p.idempotencyKey ?? randomUUID();
  const [row] = await db
    .insert(schema.runs)
    .values({
      projectId: p.projectId,
      sceneId: p.sceneId,
      takeId: p.takeId,
      stage: p.stage,
      idempotencyKey: key,
      estimateUsd: p.estimateUsd!,
      input: p.input as Record<string, unknown>,
      confirmedBy: p.confirmedBy,
    })
    // A retried request with the same key returns the existing run instead of a second one.
    .onConflictDoNothing({ target: schema.runs.idempotencyKey })
    .returning({ id: schema.runs.id });

  const runId =
    row?.id ??
    (await db.select({ id: schema.runs.id }).from(schema.runs).where(eq(schema.runs.idempotencyKey, key)))[0].id;
  await enqueueDrive(runId);
  return { runId };
}
