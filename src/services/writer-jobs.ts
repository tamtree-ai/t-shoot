import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { canSpend, type CurrentMember } from "@/lib/auth";
import { checkSpend, SpendGuardError } from "@/lib/spend-guard";
import { HooksOut, TitlesOut, TopicsOut, TranslateOut, type HooksIn, type TitlesIn, type TopicsIn, type TranslateIn } from "@/lib/tamtree/stage-flows";
import { projectSpend } from "./ledger";
import { getProject } from "./projects";
import { runStageSync } from "./tamtree-run";

const TOPIC_USD = "0.010000";
const HOOK_USD = "0.010000";
const TITLE_USD = "0.010000";
const TRANSLATE_USD = "0.010000";

async function charge(
  member: CurrentMember,
  kind: string,
  estimateUsd: string,
  flow: "studio-topics" | "studio-hooks" | "studio-titles" | "studio-translate",
  input: TopicsIn | HooksIn | TitlesIn | TranslateIn,
  projectId?: string,
) {
  if (!canSpend(member.role)) throw new Error("Clients don't start paid work.");
  if (projectId) {
    const project = await getProject(projectId);
    if (!project || project.orgId !== member.orgId) throw new Error("That project is not in this workspace.");
    const spend = await projectSpend(projectId);
    const guard = checkSpend({ estimateUsd, limitUsd: project.limitUsd, spentUsd: spend.spentUsd, inflightUsd: spend.inflightUsd });
    if (!guard.ok) throw new SpendGuardError(guard.reason, "This is over the video's limit.");
  }
  const result = await runStageSync(flow, input);
  await db.insert(schema.writerJobs).values({
    orgId: member.orgId,
    memberId: member.memberId,
    projectId,
    kind,
    estimateUsd,
    costUsd: result.costUsd.toFixed(6),
    input,
    output: result.output,
  });
  if (projectId) {
    await db.update(schema.projects).set({ lastTouchedBy: member.memberId, updatedAt: new Date() }).where(eq(schema.projects.id, projectId));
  }
  return result.output;
}

export async function summariseLink(member: CurrentMember, input: TopicsIn) {
  const output = TopicsOut.parse(await charge(member, "topics", TOPIC_USD, "studio-topics", input));
  return output.topics;
}

export async function writeHooks(member: CurrentMember, projectId: string, input: HooksIn) {
  const output = HooksOut.parse(await charge(member, "hooks", HOOK_USD, "studio-hooks", input, projectId));
  return output.hooks;
}

export async function writeTitles(member: CurrentMember, projectId: string, input: TitlesIn) {
  const output = TitlesOut.parse(await charge(member, "titles", TITLE_USD, "studio-titles", input, projectId));
  return output.pairs;
}

export async function translateCopy(member: CurrentMember, projectId: string, input: TranslateIn) {
  return TranslateOut.parse(await charge(member, "translate", TRANSLATE_USD, "studio-translate", input, projectId));
}

export const TEXT_PRICES = { topics: TOPIC_USD, hooks: HOOK_USD, titles: TITLE_USD, translate: TRANSLATE_USD };
