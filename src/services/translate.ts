import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import type { CurrentMember } from "@/lib/auth";
import { languageLabel, type LanguageId } from "@/lib/languages";
import type { Skit } from "@/lib/tamtree/stage-flows";
import { timelineDigest } from "@/lib/timeline";
import { stickSkit } from "@/types/stick-skit";
import { STICK_LINE_PRICE_USD } from "@/lib/estimate";
import { beatsOf, editBeat, judgeSkit } from "@/types/stick-skit/draft";
import { getProject, createStickSkitProject } from "./projects";
import { getSkitDraft } from "./skit";
import { translateCopy, TEXT_PRICES } from "./writer-jobs";

function priceFor(lineCount: number): string {
  const usd = Number(TEXT_PRICES.translate) + lineCount * STICK_LINE_PRICE_USD;
  return usd.toFixed(2);
}

export function languagePriceLabel(lineCount: number): string {
  return priceFor(lineCount);
}

/**
 * A linked version. The original's approval does not approve this one.
 * Lines are replaced with the writer's translation and left for a person to read.
 */
export async function makeLanguageVersion(member: CurrentMember, projectId: string, language: LanguageId): Promise<string> {
  const project = await getProject(projectId);
  if (!project || project.orgId !== member.orgId) throw new Error("That project is not in this workspace.");
  if (project.kind !== "stick_skit") throw new Error("Language versions start from a stick skit.");
  const draft = await getSkitDraft(projectId);
  if (!draft) throw new Error("Write the script before translating it.");
  const skit = draft.skit as Skit;
  const beats = beatsOf(skit).filter((b) => b.line);
  if (beats.length === 0) throw new Error("The script has no lines to translate.");
  const root = project.sourceProjectId ?? project.id;
  const family = await db.select({ id: schema.projects.id, language: schema.projects.language }).from(schema.projects).where(eq(schema.projects.sourceProjectId, root));
  if (project.language === language || family.some((row) => row.language === language)) {
    throw new Error(`This short already has a ${languageLabel(language)} version.`);
  }
  const slams = beats
    .filter((b) => b.slams.length > 0)
    .map((b) => ({ beatId: b.id, values: b.slams }));
  const translated = await translateCopy(member, projectId, {
    language,
    title: project.title,
    lines: beats.map((b) => ({ id: b.id, text: b.line! })),
    slams,
    hashtags: [],
  });
  let next = skit;
  for (const line of translated.lines) {
    if (!beats.some((b) => b.id === line.id)) continue;
    next = editBeat(next, line.id, { line: line.text });
  }
  for (const slam of translated.slams) {
    if (!beats.some((b) => b.id === slam.beatId)) continue;
    next = editBeat(next, slam.beatId, { slams: slam.values });
  }
  const brief = stickSkit.configSchema.parse(project.brief);
  const copyId = await createStickSkitProject(
    member.memberId,
    member.orgId,
    { ...brief, topic: translated.title, limitUsd: project.limitUsd },
    {
      showId: project.showId ?? undefined,
      episodeNumber: project.episodeNumber ?? undefined,
      origin: "person",
      language,
      sourceProjectId: root,
    },
  );
  const verdict = judgeSkit(next);
  await db.insert(schema.skitDrafts).values({
    projectId: copyId,
    skit: next,
    lines: verdict.lines,
    check: verdict.check,
    warnings: [...verdict.warnings, ...(translated.warning ? [translated.warning] : [])],
    estimatedDurationS: verdict.estimatedDurationS,
    catalogVersion: draft.catalogVersion,
    digest: timelineDigest(next),
    source: "edited",
  });
  await db.update(schema.projects).set({ title: `${project.title} · ${languageLabel(language)}` }).where(eq(schema.projects.id, copyId));
  return copyId;
}
