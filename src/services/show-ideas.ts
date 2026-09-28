import "server-only";

import { and, asc, eq, gte, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { ideasToDraft, weekStart } from "@/lib/draft-ahead";
import { STICK_SCRIPT_PRICE_USD } from "@/lib/estimate";
import { getShow, nextEpisodeNumber, briefFromShow } from "./shows";
import { createStickSkitProject } from "./projects";
import { writeSkit } from "./skit";

export async function listIdeas(showId: string) {
  return db.select().from(schema.showIdeas).where(eq(schema.showIdeas.showId, showId)).orderBy(asc(schema.showIdeas.position));
}

export async function addIdeas(orgId: string, showId: string, lines: string[]): Promise<void> {
  const show = await getShow(orgId, showId);
  if (!show) throw new Error("That show is not in this workspace.");
  const clean = lines.map((l) => l.trim()).filter(Boolean).slice(0, 50);
  if (clean.length === 0) throw new Error("Add an idea first.");
  const existing = await listIdeas(showId);
  let position = existing.reduce((max, row) => Math.max(max, row.position), 0);
  await db.insert(schema.showIdeas).values(clean.map((body) => ({ showId, body, position: ++position })));
}

export async function reorderIdeas(orgId: string, showId: string, ids: string[]): Promise<void> {
  const show = await getShow(orgId, showId);
  if (!show) throw new Error("That show is not in this workspace.");
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.update(schema.showIdeas).set({ position: i + 1 }).where(and(eq(schema.showIdeas.id, ids[i]!), eq(schema.showIdeas.showId, showId)));
    }
  });
}

export async function deleteIdea(orgId: string, showId: string, ideaId: string): Promise<void> {
  const show = await getShow(orgId, showId);
  if (!show) throw new Error("That show is not in this workspace.");
  await db.delete(schema.showIdeas).where(and(eq(schema.showIdeas.id, ideaId), eq(schema.showIdeas.showId, showId)));
}

export async function episodesThisWeek(showId: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.projects)
    .where(and(eq(schema.projects.showId, showId), gte(schema.projects.createdAt, weekStart(now))));
  return Number(row?.n ?? 0);
}

/**
 * Writes scripts for the next ideas, up to the show's weekly cap.
 * Voicing stays behind Approve.
 */
export async function draftAheadForShow(orgId: string, memberId: string, showId: string): Promise<number> {
  const show = await getShow(orgId, showId);
  if (!show?.config.draft_ahead) return 0;
  const cap = show.config.weekly_script_cap ?? 3;
  const ideas = (await listIdeas(showId)).filter((idea) => !idea.projectId);
  const picked = ideasToDraft({ ideas, draftedThisWeek: await episodesThisWeek(showId), weeklyCap: cap });
  let wrote = 0;
  for (const idea of picked) {
    const episodeNumber = await nextEpisodeNumber(showId);
    const brief = briefFromShow(show.config, idea.body);
    const projectId = await createStickSkitProject(memberId, orgId, brief, { showId, episodeNumber, origin: "draft-ahead" });
    await writeSkit(projectId, memberId).catch(() => undefined);
    await db.update(schema.showIdeas).set({ projectId }).where(eq(schema.showIdeas.id, idea.id));
    wrote += 1;
  }
  return wrote;
}

export function draftAheadPrice(cap: number): string {
  return (Math.round(cap * STICK_SCRIPT_PRICE_USD * 100) / 100).toFixed(2);
}

/** The worker's hourly pass. Uses each org's owner as the person who confirmed the cap. */
export async function draftAheadTick(): Promise<number> {
  const shows = await db.select().from(schema.shows);
  let wrote = 0;
  for (const show of shows) {
    const [owner] = await db
      .select()
      .from(schema.members)
      .where(and(eq(schema.members.orgId, show.orgId), eq(schema.members.role, "owner")))
      .limit(1);
    if (!owner) continue;
    wrote += await draftAheadForShow(show.orgId, owner.id, show.id).catch(() => 0);
  }
  return wrote;
}
