import "server-only";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { getCurrentMember } from "@/lib/auth";
import { PLATFORMS, PostDraft, postProblem, type Platform, type StoredPost } from "@/types/social/post";
import { getProject } from "./projects";

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
    return [{ id: row.id, versionId: row.versionId, platform: row.platform, status: row.status, payload: parsed.data, confirmedAt: row.confirmedAt?.toISOString() ?? null }];
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
      set: { status, payload: draft, confirmedAt: confirm ? now : null, updatedAt: now },
    })
    .returning();
  if (!row) throw new Error("The post was not saved.");
  return { id: row.id, versionId: row.versionId, platform: row.platform, status: row.status, payload: draft, confirmedAt: row.confirmedAt?.toISOString() ?? null };
}
