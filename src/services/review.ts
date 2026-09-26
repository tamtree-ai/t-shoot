/**
 * The client side of review (03 §1.5). Everything here is reached with a review token
 * and no login. **It never reads cost, runs or traces** (OD-8): a client sees the film,
 * the comments and two buttons.
 */
import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import type { TimelineV1 } from "@/lib/timeline";

export type ReviewView = {
  linkId: string;
  versionId: string;
  projectTitle: string;
  sharedBy: string;
  versionNumber: number;
  timeline: TimelineV1;
  approvedBy: string | null;
  comments: { id: string; authorName: string; timecodeS: number; body: string; createdAt: string }[];
};

export async function getReview(token: string): Promise<ReviewView | null> {
  const [link] = await db.select().from(schema.reviewLinks).where(and(eq(schema.reviewLinks.token, token), isNull(schema.reviewLinks.revokedAt)));
  if (!link) return null;
  const [version] = await db.select().from(schema.projectVersions).where(eq(schema.projectVersions.id, link.versionId));
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, version.projectId));
  const [owner] = project.createdBy ? await db.select().from(schema.members).where(eq(schema.members.id, project.createdBy)) : [];
  const comments = await db.select().from(schema.comments).where(eq(schema.comments.versionId, version.id)).orderBy(asc(schema.comments.createdAt));
  return {
    linkId: link.id,
    versionId: version.id,
    projectTitle: project.title,
    sharedBy: owner?.name ?? owner?.email.split("@")[0] ?? "the team",
    versionNumber: version.number,
    timeline: version.payload as unknown as TimelineV1,
    approvedBy: version.approvedBy,
    comments: comments.map((c) => ({ id: c.id, authorName: c.authorName, timecodeS: c.timecodeS, body: c.body, createdAt: c.createdAt.toISOString() })),
  };
}

async function versionForToken(token: string) {
  const review = await getReview(token);
  if (!review) throw new Error("This review link is no longer active.");
  return review;
}

export async function addComment(token: string, input: { authorName: string; timecodeS: number; body: string }) {
  const review = await versionForToken(token);
  const name = input.authorName.trim().slice(0, 60);
  const body = input.body.trim().slice(0, 2000);
  if (!name) throw new Error("Add your name so the team knows who wrote this.");
  if (!body) throw new Error("Write a comment first.");
  const t = Math.min(Math.max(0, input.timecodeS), review.timeline.duration_s);
  await db.insert(schema.comments).values({ versionId: review.versionId, authorName: name, timecodeS: t, body });
}

export async function approveVersion(token: string, name: string) {
  const review = await versionForToken(token);
  if (!name.trim()) throw new Error("Add your name to approve.");
  await db
    .update(schema.projectVersions)
    .set({ approvedBy: name.trim().slice(0, 60), approvedAt: new Date() })
    .where(eq(schema.projectVersions.id, review.versionId));
}

/** The owner's view: every comment across the project's versions, and whether it became a change. */
export async function projectComments(projectId: string) {
  const versions = await db.select().from(schema.projectVersions).where(eq(schema.projectVersions.projectId, projectId));
  const ids = new Set(versions.map((v) => v.id));
  const all = await db.select().from(schema.comments).orderBy(asc(schema.comments.createdAt));
  return all
    .filter((c) => ids.has(c.versionId))
    .map((c) => ({
      ...c,
      versionNumber: versions.find((v) => v.id === c.versionId)!.number,
      timeline: versions.find((v) => v.id === c.versionId)!.payload as unknown as TimelineV1,
    }));
}
