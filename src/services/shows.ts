import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";
import { BrandKit } from "@/lib/brand";
import { STICK_SCRIPT_PRICE_USD } from "@/lib/estimate";
import { StickBrief, StickCast } from "@/lib/tamtree/stage-flows";
import { stickCatalog } from "@/lib/stick/registry";
import { stickBriefOutsideDefaults, stickSkit } from "@/types/stick-skit";
import { getTypeDefaults } from "./type-settings";
import { createStickSkitProject } from "./projects";
import { writeSkit } from "./skit";

export const VARIATION_COUNT = 3;

export const ShowConfig = z.object({
  name: z.string().trim().min(1).max(80),
  template: z.string().optional(),
  cast: z.array(StickCast).min(1).max(2),
  set: z.string().optional(),
  tone: z.string().optional(),
  hashtags: z.string().max(200).optional(),
  ai_line: z.string().max(200).optional(),
  limit_usd: z.string(),
  brand: BrandKit.optional(),
  cadence_per_week: z.number().int().min(1).max(21).optional(),
  draft_ahead: z.boolean().optional(),
  weekly_script_cap: z.number().int().min(1).max(14).optional(),
});
export type ShowConfig = z.infer<typeof ShowConfig>;

export type ShowRow = { id: string; name: string; config: ShowConfig };

function asConfig(name: string, raw: Record<string, unknown>): ShowConfig | null {
  const parsed = ShowConfig.safeParse({ name, ...raw });
  return parsed.success ? parsed.data : null;
}

export async function listShows(orgId: string): Promise<ShowRow[]> {
  const rows = await db.select().from(schema.shows).where(eq(schema.shows.orgId, orgId)).orderBy(desc(schema.shows.updatedAt));
  return rows.flatMap((r) => {
    const config = asConfig(r.name, r.config);
    return config ? [{ id: r.id, name: r.name, config }] : [];
  });
}

export async function getShow(orgId: string, showId: string): Promise<ShowRow | null> {
  const [row] = await db.select().from(schema.shows).where(and(eq(schema.shows.id, showId), eq(schema.shows.orgId, orgId)));
  if (!row) return null;
  const config = asConfig(row.name, row.config);
  return config ? { id: row.id, name: row.name, config } : null;
}

export async function saveShow(orgId: string, input: ShowConfig, showId?: string): Promise<string> {
  const config = ShowConfig.parse(input);
  const defaults = await getTypeDefaults(orgId, stickSkit.kind);
  if (Number(config.limit_usd) > Number(defaults.limit_usd)) {
    throw new Error(`A show's cap can't be higher than the workspace cap of $${defaults.limit_usd}.`);
  }
  const previous = showId
    ? (await db.select({ config: schema.shows.config }).from(schema.shows).where(eq(schema.shows.id, showId)).limit(1))[0]?.config ?? {}
    : {};
  const { name: _name, ...rest } = config;
  const stored = {
    ...previous,
    ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined)),
  };
  if (showId) {
    const existing = await getShow(orgId, showId);
    if (!existing) throw new Error("That show is not in this workspace.");
    await db.update(schema.shows).set({ name: config.name, config: stored, updatedAt: new Date() }).where(eq(schema.shows.id, showId));
    return showId;
  }
  const [row] = await db.insert(schema.shows).values({ orgId, name: config.name, config: stored }).returning();
  if (!row) throw new Error("The show was not saved.");
  return row.id;
}

export function briefFromShow(config: ShowConfig, topic: string): StickBrief & { limitUsd: string } {
  return {
    topic,
    ...(config.template ? { template: config.template as StickBrief["template"] } : {}),
    cast: config.cast,
    ...(config.set ? { set: config.set } : {}),
    ...(config.tone ? { tone: config.tone } : {}),
    limitUsd: config.limit_usd,
  };
}

/** Three archived drafts. Nothing is voiced. Each write is the usual script price. */
export async function writeVariations(orgId: string, memberId: string, source: { topic: string; brief: StickBrief; limitUsd: string; showId?: string }): Promise<string[]> {
  const defaults = await getTypeDefaults(orgId, stickSkit.kind);
  const characters = stickCatalog.characters.filter((c) => defaults.allowed_characters.includes(c.id)).map((c) => c.id);
  const templates = ["exchange", "interview", "pov-monologue"] as const;
  const ids: string[] = [];
  for (let i = 0; i < VARIATION_COUNT; i++) {
    const template = templates[i]!;
    const castSize = stickCatalog.templates.find((t) => t.id === template)?.cast ?? 1;
    let cast = source.brief.cast.slice(0, castSize);
    if (cast.length < castSize) {
      const extra = characters.find((id) => !cast.some((c) => c.character === id)) ?? characters[0];
      if (extra) cast = [...cast, { id: extra, character: extra }];
    }
    if (i === 1 && cast.length === 2) {
      const swap = characters.find((id) => id !== cast[1]?.character && id !== cast[0]?.character);
      if (swap) cast = [cast[0]!, { id: swap, character: swap }];
    }
    const brief: StickBrief = { ...source.brief, template, cast: cast.map((c) => ({ id: c.id, character: c.character, ...(c.label ? { label: c.label } : {}) })) };
    const refusal = stickBriefOutsideDefaults(brief, source.limitUsd, defaults);
    if (refusal) continue;
    const projectId = await createStickSkitProject(memberId, orgId, { ...brief, limitUsd: source.limitUsd }, { showId: source.showId, archived: true });
    await writeSkit(projectId, memberId).catch(() => undefined);
    ids.push(projectId);
  }
  return ids;
}

export function variationPriceUsd(): number {
  return Math.round(VARIATION_COUNT * STICK_SCRIPT_PRICE_USD * 100) / 100;
}

export async function nextEpisodeNumber(showId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(max(${schema.projects.episodeNumber}), 0)` })
    .from(schema.projects)
    .where(eq(schema.projects.showId, showId));
  return Number(row?.n ?? 0) + 1;
}
