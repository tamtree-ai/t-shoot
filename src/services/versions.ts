/**
 * Versions (03 §1.6): each is a TimelineV1 snapshot with its digest. `snapshot` is
 * idempotent — an unchanged film returns the latest version instead of minting another.
 */
import "server-only";

import { randomBytes } from "node:crypto";

import { and, asc, desc, eq, isNull, max } from "drizzle-orm";

import { db, schema } from "@/db";
import { buildTimeline, sceneLength, timelineDigest, type TimelineV1 } from "@/lib/timeline";
import { aiClips } from "@/types/ai-clips";
import { typeOf } from "@/types/registry";

export async function currentTimeline(projectId: string): Promise<TimelineV1> {
  const scenes = await db
    .select()
    .from(schema.scenes)
    .where(and(eq(schema.scenes.projectId, projectId), isNull(schema.scenes.droppedAt)))
    .orderBy(asc(schema.scenes.position));
  const takes = await db.select().from(schema.takes);
  return buildTimeline(
    scenes.map((s, i) => {
      const chosen = takes.find((t) => t.id === s.chosenTakeId);
      const length = sceneLength(s, chosen?.durationS ?? null);
      return {
        scene_id: s.id,
        position: i + 1,
        title: s.title,
        length_s: length,
        clip_asset_id: chosen?.clipAssetId ?? null,
        narration_asset_id: s.narrationAssetId,
        trim_start_s: s.trimStartS,
        trim_end_s: s.trimEndS,
        captions: (s.phrases ?? []).map((p, idx) => ({ text: s.captionOverrides[idx] ?? p.text, start_s: p.start_s, end_s: p.end_s })),
      };
    }),
  );
}

export async function snapshot(projectId: string) {
  const timeline = await currentTimeline(projectId);
  const digest = timelineDigest(timeline);
  const [latest] = await db.select().from(schema.projectVersions).where(eq(schema.projectVersions.projectId, projectId)).orderBy(desc(schema.projectVersions.number)).limit(1);
  if (latest?.digest === digest) return latest;
  const [{ n }] = await db.select({ n: max(schema.projectVersions.number) }).from(schema.projectVersions).where(eq(schema.projectVersions.projectId, projectId));
  const [row] = await db
    .insert(schema.projectVersions)
    .values({ projectId, kind: aiClips.kind, number: (n ?? 0) + 1, payload: timeline as unknown as Record<string, unknown>, digest })
    .returning();
  return row;
}

/**
 * The version a review link shares: a fresh snapshot for a type whose versions are snapshots,
 * otherwise the latest one its produce run recorded.
 */
export async function versionToShare(projectId: string) {
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!project) throw new Error("Project not found.");
  if (typeOf(project).versionSource === "snapshot") return snapshot(projectId);
  const [latest] = await listVersions(projectId);
  if (!latest) throw new Error("There's no video to share yet. Approve the skit to make one.");
  return latest;
}

export async function listVersions(projectId: string) {
  return db.select().from(schema.projectVersions).where(eq(schema.projectVersions.projectId, projectId)).orderBy(desc(schema.projectVersions.number));
}

/** An opaque, unguessable token is the only credential a client holds (03 §1.5). */
export async function createReviewLink(versionId: string) {
  const [existing] = await db
    .select()
    .from(schema.reviewLinks)
    .where(and(eq(schema.reviewLinks.versionId, versionId), isNull(schema.reviewLinks.revokedAt)))
    .limit(1);
  if (existing) return existing;
  const [row] = await db.insert(schema.reviewLinks).values({ versionId, token: randomBytes(24).toString("base64url") }).returning();
  return row;
}

export async function revokeReviewLink(linkId: string) {
  await db.update(schema.reviewLinks).set({ revokedAt: new Date() }).where(eq(schema.reviewLinks.id, linkId));
}
