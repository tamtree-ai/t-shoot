import "server-only";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { getCurrentMember } from "@/lib/auth";
import { TamtreeError } from "@/lib/tamtree/adapter";
import { PublishOut, type PublishIn } from "@/lib/tamtree/stage-flows";
import { PLATFORMS, PostDraft, postProblem, type Platform, type StoredPost } from "@/types/social/post";
import { versionMedia } from "@/types/versions";
import { getProject } from "./projects";
import { runStageSync } from "./tamtree-run";
import { TamtreeRunError } from "./tamtree-run";

export type { StoredPost };

async function ownProject(projectId: string) {
  const member = await getCurrentMember();
  const project = await getProject(projectId);
  if (!project || project.orgId !== member.orgId) throw new Error("That project is not in this workspace.");
  return project;
}

export async function listPublications(projectId: string): Promise<StoredPost[]> {
  await ownProject(projectId);
  const rows = await db.select().from(schema.publications).where(eq(schema.publications.projectId, projectId));
  return rows.flatMap((row) => {
    const parsed = PostDraft.safeParse(row.payload);
    if (!parsed.success || !PLATFORMS.includes(row.platform)) return [];
    return [{
      id: row.id,
      versionId: row.versionId,
      platform: row.platform,
      status: row.status,
      payload: parsed.data,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      delivery: row.delivery === "live" || row.delivery === "failed" ? row.delivery : null,
      externalUrl: row.externalUrl,
      result: row.result,
    }];
  });
}

/**
 * Writes the post the owner will publish. `confirm` records that a person chose
 * to send it. This does not call Tamtree and does not upload.
 */
export async function savePublication(projectId: string, versionId: string, platform: Platform, payload: unknown, confirm: boolean): Promise<StoredPost> {
  await ownProject(projectId);
  if (!PLATFORMS.includes(platform)) throw new Error("That platform is not set up.");
  const draft = PostDraft.parse(payload);
  if (confirm) {
    const problem = postProblem(platform, draft);
    if (problem) throw new Error(problem);
  }
  const [version] = await db
    .select({ id: schema.projectVersions.id })
    .from(schema.projectVersions)
    .where(and(eq(schema.projectVersions.id, versionId), eq(schema.projectVersions.projectId, projectId)))
    .limit(1);
  if (!version) throw new Error("That version is not part of this project.");

  const now = new Date();
  const status = confirm ? "confirmed" : "draft";
  const [row] = await db
    .insert(schema.publications)
    .values({
      projectId,
      versionId,
      platform,
      status,
      payload: draft,
      confirmedAt: confirm ? now : null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.publications.versionId, schema.publications.platform],
      set: { status, payload: draft, confirmedAt: confirm ? now : null, delivery: null, externalUrl: null, result: null, updatedAt: now },
    })
    .returning();
  if (!row) throw new Error("The post was not saved.");
  return {
    id: row.id,
    versionId: row.versionId,
    platform: row.platform,
    status: row.status,
    payload: draft,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    delivery: row.delivery === "live" || row.delivery === "failed" ? row.delivery : null,
    externalUrl: row.externalUrl,
    result: row.result,
  };
}

/**
 * Sends a confirmed post through Tamtree's `studio-publish` flow. One film, one platform.
 * If that flow is not provisioned, the post stays confirmed and nothing is uploaded.
 */
export async function sendPublication(projectId: string, versionId: string, platform: Platform): Promise<StoredPost> {
  await ownProject(projectId);
  const [row] = await db
    .select()
    .from(schema.publications)
    .where(and(eq(schema.publications.projectId, projectId), eq(schema.publications.versionId, versionId), eq(schema.publications.platform, platform)))
    .limit(1);
  if (!row || row.status !== "confirmed") throw new Error("Confirm the post before sending it.");
  const draft = PostDraft.parse(row.payload);
  const problem = postProblem(platform, draft);
  if (problem) throw new Error(problem);
  const [version] = await db.select().from(schema.projectVersions).where(eq(schema.projectVersions.id, versionId));
  if (!version) throw new Error("That version is not part of this project.");
  const media = versionMedia(version);
  const assetId = media.kind === "video" ? media.mp4AssetId : version.renderAssetId;
  if (!assetId) throw new Error("Render the video before posting it.");

  const input: PublishIn = {
    platform,
    title: draft.title,
    description: draft.description,
    hashtags: draft.hashtags,
    tags: draft.tags,
    privacy: draft.privacy,
    ai_generated: draft.aiGenerated,
    category_id: draft.categoryId,
    scheduled_at: draft.scheduledAt,
    asset_id: assetId,
  };
  try {
    const result = await runStageSync("studio-publish", input);
    const out = PublishOut.parse(result.output);
    const [saved] = await db
      .update(schema.publications)
      .set({ delivery: "live", externalUrl: out.url, result: out.result, updatedAt: new Date() })
      .where(eq(schema.publications.id, row.id))
      .returning();
    if (!saved) throw new Error("The post was not saved.");
    return {
      id: saved.id,
      versionId: saved.versionId,
      platform,
      status: "confirmed",
      payload: draft,
      confirmedAt: saved.confirmedAt?.toISOString() ?? null,
      delivery: "live",
      externalUrl: out.url,
      result: out.result,
    };
  } catch (err) {
    const missing = err instanceof TamtreeError && err.code === "flow_not_provisioned";
    if (missing) throw new Error("The publish connector is not set up. This post stays confirmed and is not live.");
    const message = err instanceof TamtreeRunError || err instanceof Error ? err.message : "The post was not sent.";
    await db.update(schema.publications).set({ delivery: "failed", result: message, updatedAt: new Date() }).where(eq(schema.publications.id, row.id));
    throw new Error(message);
  }
}
