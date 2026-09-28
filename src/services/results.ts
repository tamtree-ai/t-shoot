import "server-only";

import { and, eq, gte } from "drizzle-orm";

import { db, schema } from "@/db";
import { whatWorked, type WorkedRow } from "@/lib/what-worked";

export type PostNumbers = {
  publicationId: string;
  projectId: string;
  platform: string;
  views: number;
  averageWatchS: number;
  averagePercent: number;
  likes: number;
  note: string | null;
};

/**
 * TikTok drafts have no public stats until the audit. YouTube and Instagram
 * wait on connector credentials; without them the row stays empty.
 */
export function statsNote(platform: string): string | null {
  if (platform === "tiktok") return "Stats after TikTok audit";
  if (!process.env.YOUTUBE_ANALYTICS_TOKEN && platform === "youtube") return null;
  if (!process.env.INSTAGRAM_INSIGHTS_TOKEN && platform === "instagram") return null;
  return null;
}

export async function statsForProjects(projectIds: string[]): Promise<Map<string, { views: number; averageWatchS: number }>> {
  const map = new Map<string, { views: number; averageWatchS: number }>();
  if (projectIds.length === 0) return map;
  const pubs = await db.select().from(schema.publications);
  const stats = await db.select().from(schema.postStats);
  const byPub = new Map(stats.map((s) => [s.publicationId, s]));
  for (const pub of pubs) {
    if (!projectIds.includes(pub.projectId) || pub.delivery !== "live") continue;
    const row = byPub.get(pub.id);
    if (!row) continue;
    const prev = map.get(pub.projectId) ?? { views: 0, averageWatchS: 0 };
    map.set(pub.projectId, { views: prev.views + row.views, averageWatchS: row.averageWatchS });
  }
  return map;
}

export async function showResults(showId: string): Promise<{
  rows: { projectId: string; title: string; views: number; averagePercent: number; likes: number; spark: number[] }[];
  worked: { sentence: string; basedOn: number } | null;
}> {
  const projects = await db.select().from(schema.projects).where(eq(schema.projects.showId, showId));
  const ids = new Set(projects.map((p) => p.id));
  const pubs = (await db.select().from(schema.publications)).filter((p) => ids.has(p.projectId) && p.delivery === "live");
  const stats = await db.select().from(schema.postStats);
  const days = await db.select().from(schema.postStatDays);
  const byPub = new Map(stats.map((s) => [s.publicationId, s]));
  const rows = projects.flatMap((project) => {
    const pub = pubs.find((p) => p.projectId === project.id);
    if (!pub) return [];
    const stat = byPub.get(pub.id);
    if (!stat) return [];
    const spark = days.filter((d) => d.publicationId === pub.id).sort((a, b) => a.day.localeCompare(b.day)).slice(-30).map((d) => d.views);
    return [{ projectId: project.id, title: project.title, views: stat.views, averagePercent: stat.averagePercent, likes: stat.likes, spark }];
  });
  const workedRows: WorkedRow[] = rows.map((row) => {
    const project = projects.find((p) => p.id === row.projectId);
    const template = typeof project?.brief.template === "string" ? project.brief.template : "Skit";
    return { group: template, hold: row.averagePercent };
  });
  return { rows, worked: whatWorked(workedRows) };
}

type Fetched = { views: number; averageWatchS: number; averagePercent: number; likes: number } | { unavailable: string };

async function fetchStats(platform: string, externalUrl: string | null): Promise<Fetched> {
  if (platform === "tiktok") return { unavailable: "Stats after TikTok audit" };
  if (platform === "youtube" && !process.env.YOUTUBE_ANALYTICS_TOKEN) return { unavailable: "connector" };
  if (platform === "instagram" && !process.env.INSTAGRAM_INSIGHTS_TOKEN) return { unavailable: "connector" };
  if (!externalUrl) return { unavailable: "connector" };
  return { unavailable: "connector" };
}

/** Daily poll, 30 days after a post goes live. No real-time dashboard. */
export async function pollPostStats(now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const pubs = await db
    .select()
    .from(schema.publications)
    .where(and(eq(schema.publications.delivery, "live"), gte(schema.publications.updatedAt, since)));
  let wrote = 0;
  const day = now.toISOString().slice(0, 10);
  for (const pub of pubs) {
    const fetched = await fetchStats(pub.platform, pub.externalUrl);
    if ("unavailable" in fetched) continue;
    await db
      .insert(schema.postStats)
      .values({
        publicationId: pub.id,
        views: fetched.views,
        averageWatchS: fetched.averageWatchS,
        averagePercent: fetched.averagePercent,
        likes: fetched.likes,
        fetchedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.postStats.publicationId,
        set: {
          views: fetched.views,
          averageWatchS: fetched.averageWatchS,
          averagePercent: fetched.averagePercent,
          likes: fetched.likes,
          fetchedAt: now,
        },
      });
    await db
      .insert(schema.postStatDays)
      .values({ publicationId: pub.id, day, views: fetched.views, averagePercent: fetched.averagePercent })
      .onConflictDoUpdate({
        target: [schema.postStatDays.publicationId, schema.postStatDays.day],
        set: { views: fetched.views, averagePercent: fetched.averagePercent },
      });
    wrote += 1;
  }
  return wrote;
}
